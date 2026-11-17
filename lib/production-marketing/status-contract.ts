import "server-only";
export const productionMarketingStatusFields=["pendingSubscribers","confirmedSubscribers","withdrawnSubscribers","suppressedSubscribers","queuedMessages","preparedMessages","acceptedMessages","deliveredMessages","suppressedMessages","failedMessages","uncertainMessages"] as const;
export type ProductionMarketingStatus=Record<typeof productionMarketingStatusFields[number],number>;
export function parseProductionMarketingStatus(value:unknown):ProductionMarketingStatus|null {
  if(value===null)return null;
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error();
  const v=value as Record<string,unknown>;
  if(Object.keys(v).length!==productionMarketingStatusFields.length)throw new Error();
  const result={} as ProductionMarketingStatus;
  for(const key of productionMarketingStatusFields){
    const n=v[key];if(!Object.hasOwn(v,key)||typeof n!=="number"||!Number.isSafeInteger(n)||n<0)throw new Error();result[key]=n;
  }
  return result;
}
