import { describe, expect, it } from "vitest";
import { images, lines } from "@/lib/admin/form";
import { readingMinutes } from "@/lib/content/repository";
import { formatDuration, formatMonth, formatPeriod, monthsBetween } from "@/lib/format";

describe("dates", () => {
  it("formats without timezone drift", () => {
    expect(formatMonth("2025-12-01")).toBe("dic 2025");
    expect(formatPeriod("2024-07-01", "2025-01-31")).toBe("jul 2024 — ene 2025");
    expect(formatPeriod("2025-12-01", null)).toBe("dic 2025 — actualidad");
  });

  it("counts months inclusively", () => {
    expect(monthsBetween("2024-07-01", "2025-01-31")).toBe(7);
    expect(monthsBetween("2025-12-01", null, new Date("2026-09-21T00:00:00Z"))).toBe(10);
    expect(formatDuration(31)).toBe("2 años 7 meses");
    expect(formatDuration(1)).toBe("1 mes");
  });
});

describe("reading time", () => {
  it("never reports less than one minute", () => {
    expect(readingMinutes("hola")).toBe(1);
    expect(readingMinutes("palabra ".repeat(660))).toBe(3);
  });
});

describe("form helpers", () => {
  it("splits textareas into trimmed non-empty lines", () => {
    const fd = new FormData();
    fd.set("h", " uno \r\n\n dos ");
    expect(lines(fd, "h")).toEqual(["uno", "dos"]);
  });

  it("parses 'url | alt | caption' image lines", () => {
    const fd = new FormData();
    fd.set("i", "/a.png | Captura | Pie\n/b.png|Otra");
    expect(images(fd, "i")).toEqual([
      { url: "/a.png", alt: "Captura", caption: "Pie" },
      { url: "/b.png", alt: "Otra", caption: "" },
    ]);
  });
});
