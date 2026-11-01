import { describe, expect, it } from "bun:test";
import { escapeHtml, fillSlots, plainText } from "../html.ts";
import { failure } from "./failure.ts";

interface TextRow {
  name: string;
  input: string;
  want: string;
}

describe("plainText", () => {
  const rows: readonly TextRow[] = [
    { name: "tags dropped", input: 'a <span title="x">b</span> c', want: "a b c" },
    { name: "entities decoded", input: "a &amp; b &lt;c&gt; &quot;d&quot;", want: 'a & b <c> "d"' },
    { name: "whitespace folded", input: "a\n   b", want: "a b" },
    { name: "empty", input: "", want: "" },
    { name: "named spaces", input: "a&nbsp;b&hairsp;c", want: "a b c" },
    { name: "decimal and hex", input: "it&#39;s &#x2014; done", want: "it's — done" },
    { name: "an apostrophe by name", input: "it&apos;s", want: "it's" },
    { name: "a > inside an attribute", input: '<span title="a > b">c</span> d', want: "c d" },
    // the case a tag-stripping regex let through (CodeQL js/incomplete-multi-character-sanitization)
    { name: "an unfinished tag goes", input: "a <script", want: "a" },
    { name: "an unfinished tag inside a word goes", input: "x<scr<b>ipt>y", want: "xipt>y" },
    { name: "a script's code is not text", input: "<script>alert(1)</script>ok", want: "ok" },
    { name: "an unknown entity stays as written", input: "a &bogus; b", want: "a &bogus; b" },
    { name: "a number past the last character becomes the replacement character", input: "&#x110000;", want: "�" },
    { name: "spaces at either end go", input: "  <b>x</b>  ", want: "x" },
  ];

  it.each(rows)("$name", ({ input, want }) => {
    expect(plainText(input)).toBe(want);
  });
});

describe("escapeHtml", () => {
  const rows: readonly TextRow[] = [
    { name: "plain text unchanged", input: "app v1.0", want: "app v1.0" },
    { name: "markup", input: "<b>&</b>", want: "&lt;b&gt;&amp;&lt;/b&gt;" },
    { name: "a double quote, for attributes", input: 'say "hi"', want: "say &quot;hi&quot;" },
    { name: "an escape is escaped again", input: "&amp;", want: "&amp;amp;" },
    { name: "empty", input: "", want: "" },
  ];

  it.each(rows)("$name", ({ input, want }) => {
    expect(escapeHtml(input)).toBe(want);
  });
});

describe("fillSlots", () => {
  interface Row {
    name: string;
    template: string;
    values: Record<string, string>;
    want: string;
  }

  const rows: readonly Row[] = [
    { name: "a text slot is escaped", template: "<p>{{x}}</p>", values: { x: "a<b" }, want: "<p>a&lt;b</p>" },
    { name: "a raw slot is not", template: "<p>{{{x}}}</p>", values: { x: "<b>" }, want: "<p><b></p>" },
    { name: "a slot used twice", template: "{{x}}-{{x}}", values: { x: "1" }, want: "1-1" },
    { name: "several slots", template: "{{a}}{{{b}}}", values: { a: "&", b: "&" }, want: "&amp;&" },
    // the replacer is a function, so "$&" in a README is text, not a pattern
    { name: "a value holding $&", template: "{{{x}}}", values: { x: "$&$1" }, want: "$&$1" },
    { name: "a value holding a slot is not filled again", template: "{{{x}}}", values: { x: "{{x}}" }, want: "{{x}}" },
    { name: "no slots", template: "plain", values: {}, want: "plain" },
  ];

  it.each(rows)("$name", ({ template, values, want }) => {
    expect(fillSlots(template, values)).toBe(want);
  });

  interface Refusal {
    name: string;
    template: string;
    values: Record<string, string>;
    message: string;
  }

  const refusals: readonly Refusal[] = [
    { name: "a slot with no value", template: "{{x}} {{y}}", values: { x: "1" }, message: "{{y}} has no value" },
    { name: "a value with no slot", template: "{{x}}", values: { x: "1", y: "2" }, message: "no template slot for y" },
  ];

  it.each(refusals)("refuses $name", ({ template, values, message }) => {
    expect(failure(() => fillSlots(template, values))).toContain(message);
  });
});
