export const AMIS_SOURCE_COLUMN_DATA_MESSAGE_TYPE = 'VCS_GET_AMIS_SOURCE_COLUMN_DATA';

export interface AmisSourceColumnItem {
  applicationId: string;
  candidateName: string;
  email: string | null;
  mobile: string | null;
  sourceChannel: string | null;
}

export interface AmisSourceColumnDataRequest {
  type: typeof AMIS_SOURCE_COLUMN_DATA_MESSAGE_TYPE;
  payload: {
    amisRecruitmentId: string;
  };
}

export interface AmisSourceColumnDataResponse {
  ok: boolean;
  amisRecruitmentId: string;
  items: AmisSourceColumnItem[];
  error?: string;
}
