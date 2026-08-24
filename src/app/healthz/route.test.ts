import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /healthz", () => {
  it("returns a successful process health response", () => {
    const response = GET();

    expect(response.status).toBe(200);
    return response.json().then((body) => expect(body).toEqual({ status: "ok" }));
  });
});
