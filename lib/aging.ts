export type AgingBucket="current"|"days_1_30"|"days_31_60"|"days_61_90"|"days_91_plus";
export const AGING_BUCKETS:AgingBucket[]=["current","days_1_30","days_31_60","days_61_90","days_91_plus"];
export const AGING_LABELS:Record<AgingBucket,string>={
 current:"Not yet overdue",days_1_30:"1–30 days overdue",days_31_60:"31–60 days overdue",
 days_61_90:"61–90 days overdue",days_91_plus:"91+ days overdue"
};
export function validISODate(value:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=Date.parse(value+"T00:00:00.000Z");
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function agingBucket(asOf:string,dueDate:string):AgingBucket{
 if(!validISODate(asOf)||!validISODate(dueDate))throw new Error("Expected valid ISO dates");
 const days=Math.floor((Date.parse(asOf+"T00:00:00Z")-Date.parse(dueDate+"T00:00:00Z"))/86400000);
 if(days<=0)return "current";
 if(days<=30)return "days_1_30";
 if(days<=60)return "days_31_60";
 if(days<=90)return "days_61_90";
 return "days_91_plus";
}
