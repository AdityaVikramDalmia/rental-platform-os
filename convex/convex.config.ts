import { defineApp } from "convex/server";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(workOSAuthKit);
app.use(rateLimiter);
app.use(aggregate, { name: "leadCounts" });
app.use(aggregate, { name: "visitCounts" });
app.use(aggregate, { name: "payoutTotals" });
export default app;
