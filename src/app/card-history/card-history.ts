import { CommonModule, DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, Input, OnChanges, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, catchError, map, of, switchMap, timer } from 'rxjs';
import { environment } from '../../environments/environment';

interface HistoryRow {
  id: number;
  cardId: string;
  svCardStatusId: number;
  statusName: string;
  createdBy: number;
  createdDate: string;
  productId: string | null;
  startTime: string | null;
  endTime: string | null;
}
interface CardDetail extends HistoryRow {
  chipId: string | null;
  requestHex: string | null;
  responseHex: string | null;
  responseJson: string | null;
}
interface HistoryPage { items: HistoryRow[]; totalCount: number; page: number; pageSize: number; }
interface LoadRequest { cardId: string; page: number; delay: number; }

@Component({
  selector: 'app-card-history',
  imports: [CommonModule],
  templateUrl: './card-history.html',
  styleUrl: './card-history.scss'
})
export class CardHistory implements OnChanges {
  @Input() cardId = '';
  @Input() refreshToken = 0;
  @ViewChild('detailsDialog', { static: true }) private dialog?: ElementRef<HTMLDialogElement>;
  private readonly document = inject(DOCUMENT);
  private previousOverflow: string | null = null;
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/+$/, '');
  private readonly requests = new Subject<LoadRequest | null>();
  private detailRequest?: Subscription;
  private activeCardId = '';
  readonly rows = signal<HistoryRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 20;
  readonly selectedId = signal<number | null>(null);
  readonly detail = signal<CardDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');

  constructor() {
    this.requests.pipe(
      switchMap(request => request
        ? timer(request.delay).pipe(
            switchMap(() => this.http.get<HistoryPage>(`${this.baseUrl}/api/SvCards/history`, {
              params: { cardId: request.cardId, page: request.page, pageSize: this.pageSize }
            })),
            map(result => ({ result, error: '' })),
            catchError((error: HttpErrorResponse) => of({ result: null, error: this.message(error) }))
          )
        : of({ result: null, error: '' })),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(state => {
      this.loading.set(false);
      this.error.set(state.error);
      this.rows.set(state.result?.items ?? []);
      this.total.set(state.result?.totalCount ?? 0);
    });
    this.destroyRef.onDestroy(() => this.closeDetails());
  }

  ngOnChanges(): void {
    const card = this.cardId.trim();
    const changed = card !== this.activeCardId;
    this.activeCardId = card;
    this.load(1, changed ? 400 : 0);
  }

  validCard(): boolean {
    const card = this.cardId.trim();
    return /^\d{1,50}$/.test(card) && Number(card) > 0 && Number(card) < 4294967295;
  }

  load(page = 1, delay = 0): void {
    this.closeDetails();
    this.rows.set([]);
    this.total.set(0);
    this.error.set('');
    this.page.set(page);
    this.loading.set(this.validCard());
    this.requests.next(this.validCard() ? { cardId: this.cardId.trim(), page, delay } : null);
  }

  totalPages(): number { return Math.max(1, Math.ceil(this.total() / this.pageSize)); }

  openDetails(row: HistoryRow): void {
    this.closeDetails();
    this.selectedId.set(row.id);
    this.dialog?.nativeElement.showModal();
    this.previousOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    this.detailLoading.set(true);
    const card = this.cardId.trim();
    this.detailRequest = this.http.get<CardDetail>(`${this.baseUrl}/api/SvCards/${row.id}`).subscribe({
      next: detail => {
        if (card !== this.cardId.trim() || this.selectedId() !== row.id) return;
        this.detailLoading.set(false);
        if (detail.cardId !== card) {
          this.detailError.set('The saved record does not match this card. Refresh history.');
          return;
        }
        this.detail.set(detail);
      },
      error: (error: HttpErrorResponse) => {
        this.detailLoading.set(false);
        this.detailError.set(this.message(error));
      }
    });
  }

  trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = this.dialog?.nativeElement;
    const controls = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]');
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  dismissBackdrop(event: MouseEvent): void {
    const dialog = this.dialog?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) this.closeDetails();
  }

  closeDetails(): void {
    if (this.dialog?.nativeElement.open) this.dialog.nativeElement.close();
    if (this.previousOverflow !== null) {
      this.document.body.style.overflow = this.previousOverflow;
      this.previousOverflow = null;
    }
    this.detailRequest?.unsubscribe();
    this.detail.set(null);
    this.selectedId.set(null);
    this.detailError.set('');
    this.detailLoading.set(false);
  }

  recordedAt(value: string): string {
    // SQL datetime has no timezone. Display its wall-clock value without conversion.
    return value.replace('T', ' ').replace(/\.\d+$/, '');
  }

  authorizationTime(value: string | null): string {
    return value ? new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(value)) : '—';
  }

  formattedResponse(value: string | null): string {
    if (!value) return 'Not recorded for this operation.';
    try { return JSON.stringify(JSON.parse(value), null, 2); }
    catch { return value; }
  }

  private message(error: HttpErrorResponse): string {
    if (typeof error.error?.error === 'string') return error.error.error;
    return error.status === 0
      ? 'History is unavailable. Check the API connection and try Refresh.'
      : `Unable to load saved history (HTTP ${error.status}). Try Refresh.`;
  }
}
