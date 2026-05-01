import { z } from "zod";
type Check1 = z.ZodObject<any>;
type Check3 = ReturnType<typeof z.object>;
type ExtendsCheck = Check1 extends z.ZodType<any, any, any> ? true : false;
const _v: ExtendsCheck = true;
console.log("done");
