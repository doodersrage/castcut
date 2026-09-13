import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brandedHtmlDocument,
  brandedHtmlSection,
  escapeBrandedHtml,
} from "./branded-html-shell";

describe("escapeBrandedHtml", () => {
  it("escapes &, <, >, and \" in that priority order", () => {
    assert.equal(escapeBrandedHtml(`<a href="x">Tom & Jerry</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;");
  });

  it("leaves plain text untouched", () => {
    assert.equal(escapeBrandedHtml("plain text"), "plain text");
  });
});

describe("brandedHtmlSection", () => {
  it("wraps the given HTML in a styled <section>", () => {
    const result = brandedHtmlSection("<p>hi</p>");
    assert.match(result, /^<section style="[^"]+">/);
    assert.ok(result.endsWith("<p>hi</p></section>"));
  });
});

describe("brandedHtmlDocument", () => {
  it("includes the escaped title in both the <title> tag and the <h1>", () => {
    const html = brandedHtmlDocument({ title: "A & B", bodyHtml: "<div>body</div>" });
    assert.ok(html.includes("<title>A &amp; B · Castcut</title>"));
    assert.ok(html.includes("<h1"));
    assert.ok(html.includes(">A &amp; B</h1>"));
    assert.ok(html.includes("<div>body</div>"));
  });

  it("omits the subtitle block when no subtitle is given", () => {
    const html = brandedHtmlDocument({ title: "T", bodyHtml: "" });
    assert.ok(!html.includes("font-size:12px"));
  });

  it("includes an escaped subtitle when given", () => {
    const html = brandedHtmlDocument({ title: "T", subtitle: "Sub & Title", bodyHtml: "" });
    assert.ok(html.includes("Sub &amp; Title"));
  });

  it("omits the meta line paragraph when none is given", () => {
    const html = brandedHtmlDocument({ title: "T", bodyHtml: "" });
    assert.ok(!html.includes("color:#71717a"));
  });

  it("includes an escaped meta line when given", () => {
    const html = brandedHtmlDocument({ title: "T", bodyHtml: "", metaLine: "Meta & Line" });
    assert.ok(html.includes("Meta &amp; Line"));
  });
});
