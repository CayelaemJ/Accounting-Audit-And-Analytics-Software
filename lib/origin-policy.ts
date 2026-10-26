export class RequestOriginError extends Error {
 constructor(){super("Invalid request origin");this.name="RequestOriginError";}
}
export function validSameOriginRequest(origin:string|null,host:string|null,production=false,configuredOrigin?:string):boolean{
 if(!origin||!host||!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(host))return false;
 try{
  const browser=new URL(origin);
  if(browser.origin!==origin||browser.username||browser.password||!["http:","https:"].includes(browser.protocol))return false;
  if(production&&browser.protocol!=="https:")return false;
  if(browser.host.toLowerCase()!==host.toLowerCase())return false;
  if(configuredOrigin){
   const expected=new URL(configuredOrigin);
   if(expected.origin!==configuredOrigin||expected.origin!==browser.origin||expected.host.toLowerCase()!==host.toLowerCase())return false;
  }
  return true;
 }catch{return false;}
}
