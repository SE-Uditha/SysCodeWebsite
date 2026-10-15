import 'server-only';

export { adminContentUpdateSchema } from './schemas';
export { accountCredentialVersion } from './credential-version';
export {
  isAdminStorageConfigured,
  getAdminAccount,
  getDashboardAccount,
  getDashboardAccountByIdentity,
  getDashboardAccountByEmail,
  listInquiries,
  createInquiry,
  updateInquiry,
  updateInquiryEmailStatus,
  storeAdminSession,
  hasAdminSession,
  deleteAdminSession,
  consumeStoredLoginAttempt,
  getAdminContent,
  updateAdminContent,
} from './mysql-store';
export {
  WorkflowError, contentHash, getContentRevisions, inquiryRevision,
  listStaff, createStaff, updateStaff, deleteStaff, resetStaffPassword,
  submitContentChange, submitInquiryChange, listChangeRequests, countPendingChanges,
  getChangeRequest, reviewChangeRequest,
} from './staff-store';
