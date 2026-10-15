import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../environments/environment';

type EndpointKey =
  | 'StbSyncToSvCas'
  | 'OpenAccount'
  | 'CloseAccount'
  | 'Authorize'
  | 'UnAuthorize'
  | 'ClearAuthorization'
  | 'SetTerminalStatus'
  | 'QueryAuthorization';

type FieldName = 'status' | 'cardId' | 'chipId' | 'productId' | 'startTime' | 'endTime';
type FieldType = 'text' | 'select' | 'datetime-local';

interface ProductOption {
  value: string;
  label: string;
}

interface EndpointDefinition {
  key: EndpointKey;
  label: string;
  description: string;
  method: 'POST';
  path: string;
  fields: Array<{
    name: FieldName;
    label: string;
    placeholder: string;
    hint: string;
    type?: FieldType;
    options?: ProductOption[];
  }>;
}

interface ActivityItem {
  endpoint: string;
  status: 'Success' | 'Failed' | 'Error';
  time: string;
  result: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly apiTarget = environment.apiBaseUrl;
  private readonly apiBaseUrl = environment.apiBaseUrl.replace(/\/+$/, '');
  protected readonly productOptions: ProductOption[] = [
    { value: '0x0101', label: 'Product 0x0101' },
    { value: '0x0102', label: 'Product 0x0102' },
    { value: '0x0001', label: 'Default Product 0x0001' }
  ];

  protected readonly endpoints: EndpointDefinition[] = [
    {
      key: 'StbSyncToSvCas',
      label: 'STB Sync to SV CAS',
      description: 'Synchronize an STB terminal record to SV CAS with card id and chip id.',
      method: 'POST',
      path: '/StbSyncToSvCas',
      fields: [
        {
          name: 'cardId',
          label: 'Card ID',
          placeholder: '3120913711',
          hint: 'Decimal string used to identify the STB terminal.'
        },
        {
          name: 'chipId',
          label: 'Chip ID',
          placeholder: '123456789',
          hint: 'Decimal or hex string used by the SV CAS sync command.'
        }
      ]
    },
    {
      key: 'OpenAccount',
      label: 'Open Account',
      description: 'Create or enable a terminal account with card id and chip id.',
      method: 'POST',
      path: '/OpenAccount',
      fields: [
        {
          name: 'cardId',
          label: 'Card ID',
          placeholder: '3120913711',
          hint: 'Decimal string. Valid HSCAS range starts at 2147483648.'
        },
        {
          name: 'chipId',
          label: 'Chip ID',
          placeholder: '123456789',
          hint: 'Decimal or hex string. The API converts it to 8-byte HSCAS hex.'
        }
      ]
    },
    {
      key: 'CloseAccount',
      label: 'Close Account',
      description: 'Stop service for a terminal account.',
      method: 'POST',
      path: '/CloseAccount',
      fields: [this.cardIdField()]
    },
    {
      key: 'Authorize',
      label: 'Authorize',
      description: 'Send product authorization with dynamic product, start time, and end time.',
      method: 'POST',
      path: '/Authorize',
      fields: [
        this.cardIdField(),
        {
          name: 'productId',
          label: 'Product',
          placeholder: '0x0101',
          hint: 'Choose the product id to authorize for this terminal.',
          type: 'select',
          options: this.productOptions
        },
        {
          name: 'startTime',
          label: 'Start Time',
          placeholder: '2004-01-15T00:00',
          hint: 'Authorization begin time. Sent to the API as ISO date/time.',
          type: 'datetime-local'
        },
        {
          name: 'endTime',
          label: 'End Time',
          placeholder: '2004-04-15T23:59',
          hint: 'Authorization end time. Must be later than start time.',
          type: 'datetime-local'
        }
      ]
    },
    {
      key: 'UnAuthorize',
      label: 'UnAuthorize',
      description: 'Delete product authorization by product and authorization period.',
      method: 'POST',
      path: '/UnAuthorize',
      fields: [
        this.cardIdField(),
        {
          name: 'productId',
          label: 'Product',
          placeholder: '0x0101',
          hint: 'Choose the product id to delete authorization for.',
          type: 'select',
          options: this.productOptions
        },
        {
          name: 'startTime',
          label: 'Start Time',
          placeholder: '2004-01-15T00:00',
          hint: 'Original authorization begin time for operator reference.',
          type: 'datetime-local'
        },
        {
          name: 'endTime',
          label: 'End Time',
          placeholder: '2004-04-15T23:59',
          hint: 'Original authorization end time. HSCAS anti-authorization uses this time as begin and end.',
          type: 'datetime-local'
        }
      ]
    },
    {
      key: 'ClearAuthorization',
      label: 'Clear Authorization',
      description: 'Clear all authorizations from a terminal using HSCAS manual section 4.4.',
      method: 'POST',
      path: '/ClearAuthorization',
      fields: [this.cardIdField()]
    },
    {
      key: 'SetTerminalStatus',
      label: 'Set Terminal Status',
      description: 'Activate or inactivate a terminal using HSCAS manual section 4.9.',
      method: 'POST',
      path: '/SetTerminalStatus',
      fields: [
        this.cardIdField(),
        {
          name: 'status',
          label: 'Terminal Status',
          placeholder: '',
          hint: 'Choose Inactivate (0) or Activate (1).',
          type: 'select',
          options: [
            { value: '0', label: 'Inactivate' },
            { value: '1', label: 'Activate' }
          ]
        }
      ]
    },
    {
      key: 'QueryAuthorization',
      label: 'Query Authorization',
      description: 'Read current authorization records for a terminal.',
      method: 'POST',
      path: '/QueryAuthorization',
      fields: [this.cardIdField()]
    }
  ];

  protected readonly selectedKey = signal<EndpointKey>('StbSyncToSvCas');
  protected readonly form = signal<Record<string, string>>({
    cardId: '3120913711',
    chipId: '123456789',
    status: '0',
    productId: '0x0101',
    startTime: this.formatDateTimeLocal(new Date()),
    endTime: this.formatDateTimeLocal(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
  });
  protected readonly response = signal<unknown>(null);
  protected readonly error = signal<string>('');
  protected readonly loading = signal(false);
  protected readonly activity = signal<ActivityItem[]>([
    {
      endpoint: 'Query Authorization',
      status: 'Success',
      time: '09:42',
      result: '2 records returned'
    },
    {
      endpoint: 'Close Account',
      status: 'Failed',
      time: '09:37',
      result: 'Expired time rejected'
    }
  ]);

  protected readonly selectedEndpoint = computed(
    () => this.endpoints.find((endpoint) => endpoint.key === this.selectedKey()) ?? this.endpoints[0]
  );

  protected readonly requestPreview = computed(() => {
    const endpoint = this.selectedEndpoint();
    const payload = this.buildPayload(endpoint);
    return {
      url: this.buildUrl(endpoint.path),
      method: endpoint.method,
      body: payload
    };
  });

  protected readonly successCount = computed(
    () => this.activity().filter((item) => item.status === 'Success').length
  );

  protected readonly failedCount = computed(
    () => this.activity().filter((item) => item.status !== 'Success').length
  );

  constructor(private readonly http: HttpClient) {}

  protected selectEndpoint(key: EndpointKey): void {
    this.selectedKey.set(key);
    this.response.set(null);
    this.error.set('');
  }

  protected updateField(name: string, value: string): void {
    this.form.update((current) => ({ ...current, [name]: value }));
  }

  protected sendCommand(): void {
    const endpoint = this.selectedEndpoint();
    const payload = this.buildPayload(endpoint);

    this.loading.set(true);
    this.response.set(null);
    this.error.set('');

    this.http.post(this.buildUrl(endpoint.path), payload).subscribe({
      next: (result: unknown) => {
        this.loading.set(false);
        this.response.set(result);
        this.pushActivity(endpoint.label, this.resultStatus(result), this.resultSummary(result));
      },
      error: (failure: HttpErrorResponse) => {
        this.loading.set(false);
        const message = this.extractErrorMessage(failure);
        this.error.set(message);
        this.pushActivity(endpoint.label, 'Error', message);
      }
    });
  }

  protected formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  protected trackEndpoint(_: number, endpoint: EndpointDefinition): string {
    return endpoint.key;
  }

  protected trackActivity(_: number, item: ActivityItem): string {
    return `${item.time}-${item.endpoint}-${item.result}`;
  }

  private buildPayload(endpoint: EndpointDefinition): Record<string, string | number> {
    return endpoint.fields.reduce<Record<string, string | number>>((payload, field) => {
      const value = this.form()[field.name] ?? '';
      payload[field.name] = field.name === 'status'
        ? Number(value)
        : this.normalizePayloadValue(field, value);
      return payload;
    }, {});
  }

  private normalizePayloadValue(field: EndpointDefinition['fields'][number], value: string): string {
    if (field.type !== 'datetime-local' || !value) {
      return value;
    }

    const valueWithSeconds = value.length === 16 ? `${value}:00` : value;
    return `${valueWithSeconds}Z`;
  }

  private buildUrl(path: string): string {
    return `${this.apiBaseUrl}/${path.replace(/^\/+/, '')}`;
  }

  private pushActivity(endpoint: string, status: ActivityItem['status'], result: string): void {
    const time = new Intl.DateTimeFormat('en', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());

    this.activity.update((items) => [{ endpoint, status, time, result }, ...items].slice(0, 8));
  }

  private resultStatus(result: unknown): ActivityItem['status'] {
    if (this.isRecord(result) && result['success'] === false) {
      return 'Failed';
    }

    return 'Success';
  }

  private resultSummary(result: unknown): string {
    if (!this.isRecord(result)) {
      return 'Command completed';
    }

    const meaning = result['resultMeaning'];
    const code = result['resultHex'];
    if (typeof meaning === 'string' && typeof code === 'string') {
      return `${code} ${meaning}`;
    }

    return 'Command completed';
  }

  private extractErrorMessage(error: HttpErrorResponse): string {
    if (this.isRecord(error.error) && typeof error.error['error'] === 'string') {
      return error.error['error'];
    }

    return error.message || 'Request failed';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private cardIdField(): EndpointDefinition['fields'][number] {
    return {
      name: 'cardId',
      label: 'Card ID',
      placeholder: '3120913711',
      hint: 'Send as a decimal string. The API converts it to HSCAS hex.'
    };
  }

  private formatDateTimeLocal(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hour = String(value.getHours()).padStart(2, '0');
    const minute = String(value.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hour}:${minute}`;
  }
}
