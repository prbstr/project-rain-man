// RiskService — thin service wrapper over risk/guardian.js
// guardian.js owns the logic; this conforms it to the service layer pattern

export {
  canTrade,
  calculateDailyDrawdown,
  enforceDailyDrawdown,
  emergencyFlattenAll as killSwitch,
  resetHalt,
  getRiskStatus,
  enforcePositionLimits,
} from '../risk/guardian.js';
