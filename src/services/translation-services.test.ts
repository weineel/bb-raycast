import { describe, expect, it } from "vitest";
import { createBaiduSignature, parseBaiduTranslation } from "./baidu-translate";
import { decodeHtmlEntities, parseGoogleTranslation } from "./google-translate";

describe("reference translation services", () => {
  it("creates a deterministic Baidu MD5 signature", () => {
    const signature = createBaiduSignature("app-id", "hello", "salt", "secret");
    expect(signature).toBe("83830beed764944fd8ec0aaff0db7212");
  });

  it("joins multi-part Google results", () => {
    expect(
      parseGoogleTranslation({
        data: { translations: [{ translatedText: "你好" }, { translatedText: "世界" }] },
      }),
    ).toBe("你好\n世界");
  });

  it("decodes HTML entities returned by Google", () => {
    expect(decodeHtmlEntities("Tom &amp; Jerry&#39;s")).toBe("Tom & Jerry's");
  });

  it("joins multi-part Baidu results", () => {
    expect(
      parseBaiduTranslation({
        trans_result: [{ dst: "你好" }, { dst: "世界" }],
      }),
    ).toBe("你好\n世界");
  });

  it("surfaces service errors without requiring a result", () => {
    expect(() => parseGoogleTranslation({ error: { message: "API key rejected" } })).toThrow(
      "API key rejected",
    );
    expect(() => parseBaiduTranslation({ error_code: "54001", error_msg: "Invalid Sign" })).toThrow(
      "Invalid Sign (54001)",
    );
  });
});
