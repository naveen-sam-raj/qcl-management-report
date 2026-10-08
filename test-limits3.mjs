import { ANALYSIS_LIMITS_REGISTRY } from './client/src/services/analysisValidation.js';
console.log(Object.keys(ANALYSIS_LIMITS_REGISTRY['acl'] || {}));
