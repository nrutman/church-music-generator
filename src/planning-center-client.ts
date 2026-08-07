import * as fs from 'fs';
import { PublishArtifactKind } from './publish-artifacts';
import { PublishConfig } from './publish-config';
import { Song } from './types';

const SERVICES_BASE_URL = 'https://api.planningcenteronline.com/services/v2';
const UPLOAD_URL = 'https://upload.planningcenteronline.com/v2/files';

export interface JsonApiResource<Attributes> {
  id: string;
  type: string;
  attributes: Attributes;
  links?: Record<string, string>;
}

interface CollectionResponse<Attributes> {
  data: JsonApiResource<Attributes>[];
  links?: { next?: string | null };
}

interface ResourceResponse<Attributes> {
  data: JsonApiResource<Attributes>;
}

interface UploadResponse {
  data: { id: string }[];
}

export interface PlanningCenterSongAttributes {
  title: string;
  author?: string;
  copyright?: string;
  ccli_number?: number;
  hidden?: boolean;
}

export interface PlanningCenterArrangementAttributes {
  name: string;
}

export interface PlanningCenterKeyAttributes {
  name: string | null;
  starting_key: string;
  ending_key: string;
}

export interface PlanningCenterAttachmentAttributes {
  filename: string;
  display_name?: string;
  file_size?: number;
  url?: string;
  updated_at?: string;
}

export interface PlanningCenterAttachmentTypeAttributes {
  name: string;
  lyrics: boolean;
  chord_charts: boolean;
  capoed_chord_charts: boolean;
}

export type PlanningCenterSong = JsonApiResource<PlanningCenterSongAttributes>;
export type PlanningCenterArrangement = JsonApiResource<PlanningCenterArrangementAttributes>;
export type PlanningCenterKey = JsonApiResource<PlanningCenterKeyAttributes>;
export type PlanningCenterAttachment = JsonApiResource<PlanningCenterAttachmentAttributes>;
export type PlanningCenterAttachmentType = JsonApiResource<PlanningCenterAttachmentTypeAttributes>;

function jsonBody(type: string, attributes: object, relationships?: object): string {
  return JSON.stringify({
    data: {
      type,
      attributes,
      ...(relationships ? { relationships } : {}),
    },
  });
}

export class PlanningCenterClient {
  private readonly authorization: string;
  private readonly userAgent: string;

  constructor(config: PublishConfig['planningCenter']) {
    this.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`;
    this.userAgent = config.userAgent;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', this.authorization);
    headers.set('User-Agent', this.userAgent);
    headers.set('Accept', 'application/json');
    if (init.body && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url.startsWith('http') ? url : `${SERVICES_BASE_URL}${url}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Planning Center request failed (${response.status} ${response.statusText}): ${detail}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async collection<Attributes>(url: string): Promise<JsonApiResource<Attributes>[]> {
    const resources: JsonApiResource<Attributes>[] = [];
    let nextUrl: string | null | undefined = url;
    while (nextUrl) {
      const response: CollectionResponse<Attributes> = await this.request(nextUrl);
      resources.push(...response.data);
      nextUrl = response.links?.next;
    }
    return resources;
  }

  searchSongs(title: string): Promise<PlanningCenterSong[]> {
    const query = new URLSearchParams({ 'where[title]': title, per_page: '100' });
    return this.collection(`/songs?${query.toString()}`);
  }

  async getSong(songId: string): Promise<PlanningCenterSong> {
    const response = await this.request<ResourceResponse<PlanningCenterSongAttributes>>(
      `/songs/${songId}`,
    );
    return response.data;
  }

  listArrangements(songId: string): Promise<PlanningCenterArrangement[]> {
    return this.collection(`/songs/${songId}/arrangements?per_page=100`);
  }

  listKeys(songId: string, arrangementId: string): Promise<PlanningCenterKey[]> {
    return this.collection(`/songs/${songId}/arrangements/${arrangementId}/keys?per_page=100`);
  }

  listArrangementAttachments(
    songId: string,
    arrangementId: string,
  ): Promise<PlanningCenterAttachment[]> {
    return this.collection(
      `/songs/${songId}/arrangements/${arrangementId}/attachments?per_page=100`,
    );
  }

  listKeyAttachments(
    songId: string,
    arrangementId: string,
    keyId: string,
  ): Promise<PlanningCenterAttachment[]> {
    return this.collection(
      `/songs/${songId}/arrangements/${arrangementId}/keys/${keyId}/attachments?per_page=100`,
    );
  }

  listAttachmentTypes(): Promise<PlanningCenterAttachmentType[]> {
    const query = new URLSearchParams({
      per_page: '100',
      'fields[AttachmentType]': 'name,lyrics,chord_charts,capoed_chord_charts',
    });
    return this.collection(`/attachment_types?${query.toString()}`);
  }

  async createSong(song: Song, ccliNumber?: number): Promise<PlanningCenterSong> {
    const response = await this.request<ResourceResponse<PlanningCenterSongAttributes>>('/songs', {
      method: 'POST',
      body: jsonBody('Song', {
        title: song.title,
        author: song.composers,
        copyright: song.copyright,
        ...(ccliNumber ? { ccli_number: ccliNumber } : {}),
      }),
    });
    return response.data;
  }

  async createArrangement(
    songId: string,
    name = 'Default Arrangement',
  ): Promise<PlanningCenterArrangement> {
    const response = await this.request<ResourceResponse<PlanningCenterArrangementAttributes>>(
      `/songs/${songId}/arrangements`,
      {
        method: 'POST',
        body: jsonBody('Arrangement', { name }),
      },
    );
    return response.data;
  }

  async createKey(
    songId: string,
    arrangementId: string,
    performedKey: string,
  ): Promise<PlanningCenterKey> {
    const response = await this.request<ResourceResponse<PlanningCenterKeyAttributes>>(
      `/songs/${songId}/arrangements/${arrangementId}/keys`,
      {
        method: 'POST',
        body: jsonBody('Key', {
          name: performedKey,
          starting_key: performedKey,
          ending_key: performedKey,
        }),
      },
    );
    return response.data;
  }

  async uploadFile(filePath: string, fileName: string): Promise<string> {
    const form = new FormData();
    const bytes = fs.readFileSync(filePath);
    form.append(
      'file',
      new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      fileName,
    );
    const response = await this.request<UploadResponse>(UPLOAD_URL, {
      method: 'POST',
      body: form,
    });
    const identifier = response.data[0]?.id;
    if (!identifier) throw new Error('Planning Center upload did not return a file identifier');
    return identifier;
  }

  createArrangementAttachment(
    songId: string,
    arrangementId: string,
    fileUploadIdentifier: string,
    fileName: string,
    attachmentTypeId?: string,
  ): Promise<ResourceResponse<PlanningCenterAttachmentAttributes>> {
    return this.request(`/songs/${songId}/arrangements/${arrangementId}/attachments`, {
      method: 'POST',
      body: this.attachmentBody(fileUploadIdentifier, fileName, attachmentTypeId),
    });
  }

  updateArrangementAttachment(
    songId: string,
    arrangementId: string,
    attachmentId: string,
    fileUploadIdentifier: string,
    fileName: string,
    attachmentTypeId?: string,
  ): Promise<ResourceResponse<PlanningCenterAttachmentAttributes>> {
    return this.request(
      `/songs/${songId}/arrangements/${arrangementId}/attachments/${attachmentId}`,
      {
        method: 'PATCH',
        body: this.attachmentBody(fileUploadIdentifier, fileName, attachmentTypeId),
      },
    );
  }

  deleteArrangementAttachment(
    songId: string,
    arrangementId: string,
    attachmentId: string,
  ): Promise<void> {
    return this.request(
      `/songs/${songId}/arrangements/${arrangementId}/attachments/${attachmentId}`,
      { method: 'DELETE' },
    );
  }

  createKeyAttachment(
    songId: string,
    arrangementId: string,
    keyId: string,
    fileUploadIdentifier: string,
    fileName: string,
    attachmentTypeId?: string,
  ): Promise<ResourceResponse<PlanningCenterAttachmentAttributes>> {
    return this.request(
      `/songs/${songId}/arrangements/${arrangementId}/keys/${keyId}/attachments`,
      {
        method: 'POST',
        body: this.attachmentBody(fileUploadIdentifier, fileName, attachmentTypeId),
      },
    );
  }

  updateKeyAttachment(
    songId: string,
    arrangementId: string,
    keyId: string,
    attachmentId: string,
    fileUploadIdentifier: string,
    fileName: string,
    attachmentTypeId?: string,
  ): Promise<ResourceResponse<PlanningCenterAttachmentAttributes>> {
    return this.request(
      `/songs/${songId}/arrangements/${arrangementId}/keys/${keyId}/attachments/${attachmentId}`,
      {
        method: 'PATCH',
        body: this.attachmentBody(fileUploadIdentifier, fileName, attachmentTypeId),
      },
    );
  }

  deleteKeyAttachment(
    songId: string,
    arrangementId: string,
    keyId: string,
    attachmentId: string,
  ): Promise<void> {
    return this.request(
      `/songs/${songId}/arrangements/${arrangementId}/keys/${keyId}/attachments/${attachmentId}`,
      { method: 'DELETE' },
    );
  }

  private attachmentBody(
    fileUploadIdentifier: string,
    fileName: string,
    attachmentTypeId?: string,
  ): string {
    const relationships = attachmentTypeId
      ? {
          attachment_types: {
            data: [{ type: 'AttachmentType', id: attachmentTypeId }],
          },
        }
      : undefined;
    return jsonBody(
      'Attachment',
      { file_upload_identifier: fileUploadIdentifier, filename: fileName },
      relationships,
    );
  }
}

export type PlanningCenterApi = Pick<
  PlanningCenterClient,
  | 'searchSongs'
  | 'getSong'
  | 'listArrangements'
  | 'listKeys'
  | 'listArrangementAttachments'
  | 'listKeyAttachments'
  | 'listAttachmentTypes'
  | 'createSong'
  | 'createArrangement'
  | 'createKey'
  | 'uploadFile'
  | 'createArrangementAttachment'
  | 'updateArrangementAttachment'
  | 'deleteArrangementAttachment'
  | 'createKeyAttachment'
  | 'updateKeyAttachment'
  | 'deleteKeyAttachment'
>;

export function attachmentTypeMatches(
  type: PlanningCenterAttachmentType,
  artifactKind: PublishArtifactKind,
): boolean {
  if (artifactKind === 'lyric') return type.attributes.lyrics;
  if (artifactKind === 'capo') return type.attributes.capoed_chord_charts;
  return type.attributes.chord_charts && !type.attributes.capoed_chord_charts;
}
