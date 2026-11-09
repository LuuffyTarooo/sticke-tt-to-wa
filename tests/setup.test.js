import assert from "node:assert";
import sharp from "sharp";
import express from "express";

assert(typeof sharp === "function", "sharp should be a function");
assert(typeof express === "function", "express should be a function");
console.log("Setup verification passed!");

