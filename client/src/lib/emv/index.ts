// EMV Offline Transaction Engine
// Complete device-side EMV processing for offline transactions

export { TLVParser } from './tlv-parser';
export type { EMVTag } from './tlv-parser';
export { ApplicationSelector } from './application-selector';
export type { ApplicationTemplate } from './application-selector';
export { OfflineDataAuthentication } from './offline-data-authentication';
export type { AuthenticationResult, CAPK } from './offline-data-authentication';
export { RSAODA } from './rsa-oda';
export type { ODAResult } from './rsa-oda';
export { ICCPublicKeyRecovery } from './icc-public-key';
export type { ICCPublicKey } from './icc-public-key';
export { TerminalRiskManagement } from './terminal-risk-management';
export type { TerminalRiskResult, TerminalLimits } from './terminal-risk-management';
export { CardRiskManagement } from './card-risk-management';
export type { CardRiskResult, CardLimits } from './card-risk-management';
export { CVMProcessor } from './cvm-processor';
export type { CVMResult, CVMRule } from './cvm-processor';
export { CVMTable } from './cvm-table';
export type { CVMDecision, CVMMethod } from './cvm-table';
export { ActionCodeProcessor } from './action-code-processor';
export type { ActionCodeResult } from './action-code-processor';
export { CryptogramGenerator } from './cryptogram-generator';
export type { CryptogramResult, CryptogramInput } from './cryptogram-generator';
export { TVRTSIBuilder } from './tvr-tsi-builder';
export type { TVRContext, TSIContext } from './tvr-tsi-builder';
export { POSAPDUBridge, buildAPDU, parseResponse } from './pos-apdu-bridge';
export type { APDUResponse, APDUCommand, APDUTransport, CardInterface } from './pos-apdu-bridge';
export { ICCReader } from './icc-reader';
export { NFCReader, PPSE_AID, CONTACTLESS_AIDS } from './nfc-reader';
export { PinPad } from './pin-pad';
export type { PinResult, PinPadInterface } from './pin-pad';
export { OfflinePIN } from './offline-pin';
export type { OfflinePinResult } from './offline-pin';
export { RecordReader } from './record-reader';
export type { RecordResult, AFL, AFLEntry } from './record-reader';
export { AIDSelector, PAYMENT_AIDS } from './aid-selector';
export type { AIDSelectResult } from './aid-selector';
export { GPOHandler } from './gpo-handler';
export type { GPOResult, PDOLItem } from './gpo-handler';
export { EMVCardFlow } from './emv-card-flow';
export type { CardFlowResult } from './emv-card-flow';
export { ACCryptogramGenerator } from './ac-generator';
export type { ACResult } from './ac-generator';
export { IssuerScriptProcessor } from './issuer-script';
export type { ScriptResult, ScriptCommandResult, IssuerAuthResult } from './issuer-script';
export { OnlineAuth, ARC } from './online-auth';
export type { OnlineAuthRequest, OnlineAuthResponse, EMVDataBlock } from './online-auth';
export { EMVStateMachine } from './emv-state-machine';
export type { EMVStateResult, EMVStateMachineConfig, EMVState } from './emv-state-machine';
export { ContactlessKernel } from './contactless-kernel';
export type { CTLResult, ContactlessMode, PaymentScheme } from './contactless-kernel';
export { EMVRouter } from './emv-router';
export type { RouteResult, RouteConfig, RoutePath } from './emv-router';
export { MagstripeReader } from './magstripe-reader';
export type { MagstripeData, ServiceCodeInfo } from './magstripe-reader';
export { OfflineTransactionStorage } from './offline-storage';
export type { EMVTransaction, OfflineStorageConfig } from './offline-storage';
export { EMVOfflineTransactionEngine } from './emv-engine';
export type { EMVTransactionResult, EMVTransactionInput } from './emv-engine';

import { EMVOfflineTransactionEngine } from './emv-engine';
import type { CAPK } from './offline-data-authentication';

const defaultCAPKs: CAPK[] = [];

export const emvEngine = new EMVOfflineTransactionEngine(defaultCAPKs);
export default emvEngine;