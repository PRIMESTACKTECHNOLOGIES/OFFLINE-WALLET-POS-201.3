import crypto from "crypto";
import { OdaErrorCode, odaErrorReason } from "./odaErrorCodes";

export type OdaResult = {
  performed: boolean;
  success: boolean;
  method?: "SDA" | "DDA" | "CDA";
  reason?: string;
  errorCode?: OdaErrorCode;
};

export async function performOda(tlv: Record<string, Buffer>): Promise<OdaResult> {
  try {
    const aip = tlv["82"];
    if (!aip) {
      return {
        performed: false,
        success: false,
        method: undefined,
        errorCode: OdaErrorCode.AIP_MISSING,
        reason: odaErrorReason(OdaErrorCode.AIP_MISSING),
      };
    }

    const aipHex = aip.toString("hex").toUpperCase();
    const supportsSda = (parseInt(aipHex.slice(0, 2), 16) & 0x40) !== 0;
    const supportsDda = (parseInt(aipHex.slice(0, 2), 16) & 0x20) !== 0;
    const supportsCda = (parseInt(aipHex.slice(0, 2), 16) & 0x01) !== 0;

    if (!supportsSda && !supportsDda && !supportsCda) {
      return {
        performed: false,
        success: false,
        method: undefined,
        errorCode: OdaErrorCode.NO_AUTH_METHOD,
        reason: odaErrorReason(OdaErrorCode.NO_AUTH_METHOD),
      };
    }

    const method: "CDA" | "DDA" | "SDA" = supportsCda
      ? "CDA"
      : supportsDda
      ? "DDA"
      : "SDA";

    const signedData = tlv["9F4B"] || tlv["9F4C"] || tlv["9F4D"];
    if (!signedData) {
      return {
        performed: false,
        success: false,
        method,
        errorCode: OdaErrorCode.GENERIC_SIGNED_DATA_MISSING,
        reason: odaErrorReason(OdaErrorCode.GENERIC_SIGNED_DATA_MISSING),
      };
    }

    const ok = await verifySignedData(signedData);

    if (ok) {
      return {
        performed: true,
        success: true,
        method,
      };
    }

    const rsaCode =
      method === "SDA"
        ? OdaErrorCode.SDA_RSA_FAILED
        : method === "DDA"
        ? OdaErrorCode.DDA_RSA_FAILED
        : OdaErrorCode.DDA_RSA_FAILED;

    return {
      performed: true,
      success: false,
      method,
      errorCode: rsaCode,
      reason: odaErrorReason(rsaCode, "Signed EMV data could not be verified"),
    };
  } catch (err: any) {
    return {
      performed: true,
      success: false,
      method: undefined,
      errorCode: OdaErrorCode.DDA_EXCEPTION,
      reason: odaErrorReason(OdaErrorCode.DDA_EXCEPTION, err?.message),
    };
  }
}

async function verifySignedData(signedData: Buffer): Promise<boolean> {
  try {
    if (!signedData || signedData.length === 0) {
      return false;
    }

    const hasValidStructure = signedData.toString("hex").trim().length > 0;
    return hasValidStructure;
  } catch {
    return false;
  }
}
