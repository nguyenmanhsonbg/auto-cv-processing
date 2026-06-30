import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FacebookPublishResultStatus,
  ResolvedFacebookPublishTarget,
} from '../facebook-publishing.types';
import { FacebookGroupRpaClient } from '../rpa/facebook-group-rpa.client';

interface GraphApiResponse {
  id?: string;
  error?: {
    message?: string;
  };
}

@Injectable()
export class FacebookPageClient {
  constructor(
    private readonly configService: ConfigService,
    private readonly rpaClient: FacebookGroupRpaClient,
  ) {}

  async publishToFanpage(target: ResolvedFacebookPublishTarget, content: string) {
    const accessToken = this.configService.get<string>('FACEBOOK_PAGE_ACCESS_TOKEN');
    const configuredPageId = this.configService.get<string>('FACEBOOK_PAGE_ID');
    const pageId = target.targetExternalId || configuredPageId;

    if (!accessToken || !pageId) {
      return this.rpaClient.publishToFanpage(target, content);
    }

    const graphVersion = this.configService.get<string>('FACEBOOK_GRAPH_API_VERSION', 'v20.0');
    const endpoint = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageId)}/feed`;

    try {
      const body = new URLSearchParams({
        message: content,
        access_token: accessToken,
      });
      const response = await fetch(endpoint, {
        method: 'POST',
        body,
      });
      const data = await response.json() as GraphApiResponse;

      if (!response.ok || data.error) {
        return {
          status: FacebookPublishResultStatus.FAILED,
          message: data.error?.message || 'Facebook Page Graph API publish failed.',
        };
      }

      return {
        status: FacebookPublishResultStatus.SUCCESS,
        message: 'Published to Facebook page',
        externalPostId: data.id ?? null,
      };
    } catch {
      return {
        status: FacebookPublishResultStatus.FAILED,
        message: 'Facebook Page Graph API is not available.',
      };
    }
  }
}
