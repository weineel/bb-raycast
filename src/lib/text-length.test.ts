import { describe, expect, it } from "vitest";
import { unicodeLength } from "./text-length";

describe("unicodeLength", () => {
  it("counts a surrogate-pair emoji as one Unicode code point", () => {
    expect(unicodeLength("a😀b")).toBe(3);
  });
});
