import { describe, expect, it } from "vitest";
import { formatChannelPreview } from "../chat";

describe("formatChannelPreview", () => {
  it("shows a shared terms proposal as plain text, not its ids", () => {
    expect(formatChannelPreview("NEGOTIATION_PROPOSAL_SHARED:q575nq50:ps7fhs8p")).toBe(
      "Terms proposal shared",
    );
  });

  it("shows a shared checklist as plain text", () => {
    expect(formatChannelPreview("CHECKLIST_SHARED:jd7abc")).toBe("Checklist shared");
  });

  it("leaves ordinary messages unchanged", () => {
    expect(formatChannelPreview("I can move in after the 10th.")).toBe(
      "I can move in after the 10th.",
    );
  });
});
