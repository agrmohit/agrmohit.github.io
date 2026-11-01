import { describe, expect, it } from "bun:test";
import { copiedText, isLong } from "../../assets/js/copy-rules.js";

interface Row {
  name: string;
  text: string;
  want: boolean;
}

describe("isLong", () => {
  const rows: readonly Row[] = [
    { name: "two lines", text: "make install\nmake test\n", want: true },
    { name: "many lines", text: '{\n  "a": 1\n}\n', want: true },
    { name: "one line of 41 characters", text: `${"x".repeat(41)}\n`, want: true },
    { name: "one line of exactly 40 characters", text: `${"x".repeat(40)}\n`, want: false },
    { name: "a short command", text: "beszelscope version\n", want: false },
    // the newline that ends a block is not a second line
    { name: "one line without its final newline", text: "beszelscope version", want: false },
    { name: "a blank second line still counts", text: "a\n\n", want: true },
    { name: "empty", text: "", want: false },
  ];

  it.each(rows)("$name", ({ text, want }) => {
    expect(isLong(text)).toBe(want);
  });
});

describe("copiedText", () => {
  interface TextRow {
    name: string;
    text: string;
    want: string;
  }

  const rows: readonly TextRow[] = [
    { name: "the final newline goes", text: "make install\n", want: "make install" },
    { name: "only one final newline goes", text: "a\n\n", want: "a\n" },
    { name: "inner newlines stay", text: "a\nb\n", want: "a\nb" },
    { name: "no final newline: unchanged", text: "a", want: "a" },
    { name: "spaces stay", text: "  indented  \n", want: "  indented  " },
    { name: "a $ prompt stays: the block is copied as shown", text: "$ make\n", want: "$ make" },
    { name: "empty", text: "", want: "" },
  ];

  it.each(rows)("$name", ({ text, want }) => {
    expect(copiedText(text)).toBe(want);
  });
});
