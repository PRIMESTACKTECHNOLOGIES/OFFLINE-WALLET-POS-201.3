export enum PosDecision {
  OFFLINE_APPROVE = "OFFLINE_APPROVE",
  ONLINE_APPROVE = "ONLINE_APPROVE",
  DECLINE = "DECLINE",
}

export enum PosMode {
  OFFLINE = "offline",
  ONLINE = "online",
}

export enum OdaErrorCode {
  AIP_MISSING = "AIP_MISSING",
  NO_AUTH_METHOD = "NO_AUTH_METHOD",

  SDA_SSAD_MISSING = "SDA_SSAD_MISSING",
  SDA_ISSUER_CERT_MISSING = "SDA_ISSUER_CERT_MISSING",
  SDA_RID_CAPKI_MISSING = "SDA_RID_CAPKI_MISSING",
  SDA_CAPK_NOT_FOUND = "SDA_CAPK_NOT_FOUND",
  SDA_RSA_FAILED = "SDA_RSA_FAILED",
  SDA_EXCEPTION = "SDA_EXCEPTION",

  DDA_ICC_CERT_MISSING = "DDA_ICC_CERT_MISSING",
  DDA_DYNAMIC_SIG_MISSING = "DDA_DYNAMIC_SIG_MISSING",
  DDA_ICC_KEY_UNRECOVERABLE_CAPK_MISSING = "DDA_ICC_KEY_UNRECOVERABLE_CAPK_MISSING",
  DDA_ICC_KEY_UNRECOVERABLE_RID_CAPKI_MISSING = "DDA_ICC_KEY_UNRECOVERABLE_RID_CAPKI_MISSING",
  DDA_RSA_FAILED = "DDA_RSA_FAILED",
  DDA_EXCEPTION = "DDA_EXCEPTION",

  CDA_SIG_MISSING_FALLBACK_DDA = "CDA_SIG_MISSING_FALLBACK_DDA",
  CDA_EXCEPTION = "CDA_EXCEPTION",

  GENERIC_SIGNED_DATA_MISSING = "GENERIC_SIGNED_DATA_MISSING",
  GENERIC_RSA_FAILED = "GENERIC_RSA_FAILED",
}

export type OdaResult = {
  performed: boolean;
  success: boolean;
  method?: "SDA" | "DDA" | "CDA";
  reason?: string;
  errorCode?: OdaErrorCode;
};

export type CvmResult = {
  ok: boolean;
  method?: string;
  reason?: string;
};

export type TerminalConfig = {
  onlineOnly: boolean;
  offlineFloorLimit: number;
  randomOnlineRate: number; // 0–1
};

export type MerchantProfile = {
  highRisk: boolean;
};

export type PosDecisionResult = {
  decision: PosDecision;
  mode: PosMode;
  reason: string;
  oda: OdaResult;
  cvm: CvmResult;
  processor?: {
    approved?: boolean;
    code?: string;
    reason?: string;
    authCode?: string;
    processorId?: string;
  };
};
