"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const nodes_1 = require("./nodes");
const memoize_1 = require("./util/memoize");
class PlaceholderSubstituter {
    static replacePlaceholders(typescript, settings, node) {
        const literalContents = node.getText().slice(1, -1);
        if (node.kind === typescript.SyntaxKind.NoSubstitutionTemplateLiteral) {
            return {
                text: literalContents,
                substitutions: []
            };
        }
        return PlaceholderSubstituter.getSubstitutions(settings, literalContents, PlaceholderSubstituter.getPlaceholderSpans(node), node);
    }
    static getPlaceholderSpans(node) {
        const spans = [];
        const stringStart = node.getStart() + 1;
        let nodeStart = node.head.end - stringStart - 2;
        for (const child of node.templateSpans.map(x => x.literal)) {
            const start = child.getStart() - stringStart + 1;
            spans.push({ start: nodeStart, end: start });
            nodeStart = child.getEnd() - stringStart - 2;
        }
        return spans;
    }
    static getSubstitutions(settings, contents, locations, node) {
        if (settings.getSubstitutions) {
            return settings.getSubstitutions(node);
        }
        const substitutions = [];
        const parts = [];
        let lastIndex = 0;
        for (const span of locations) {
            parts.push(contents.slice(lastIndex, span.start));
            parts.push(this.getSubstitution(settings, contents, span.start, span.end));
            substitutions.push({
                start: span.start,
                oldStop: span.end,
                newStop: span.end
            });
            lastIndex = span.end;
        }
        parts.push(contents.slice(lastIndex));
        return {
            text: parts.join(''),
            substitutions
        };
    }
    static getSubstitution(settings, templateString, start, end) {
        return settings.getSubstitution
            ? settings.getSubstitution(templateString, start, end)
            : 'x'.repeat(end - start);
    }
}
class StandardTemplateContext {
    constructor(typescript, fileName, node, helper, templateSettings) {
        this.typescript = typescript;
        this.fileName = fileName;
        this.node = node;
        this.helper = helper;
        this.templateSettings = templateSettings;
    }
    toOffset(position) {
        const docOffset = this.helper.getOffset(this.fileName, position.line + this.stringBodyPosition.line, position.line === 0 ? this.stringBodyPosition.character + position.character : position.character);
        return docOffset - this.stringBodyOffset;
    }
    toPosition(offset) {
        const docPosition = this.helper.getLineAndChar(this.fileName, this.stringBodyOffset + offset);
        return nodes_1.relative(this.stringBodyPosition, docPosition);
    }
    get stringBodyOffset() {
        return this.node.getStart() + 1;
    }
    get stringBodyPosition() {
        return this.helper.getLineAndChar(this.fileName, this.stringBodyOffset);
    }
    get text() {
        const { text } = PlaceholderSubstituter.replacePlaceholders(this.typescript, this.templateSettings, this.node);
        return text;
    }
    get rawText() {
        return this.node.getText().slice(1, -1);
    }
    getSubstitution(start) {
        const { substitutions } = PlaceholderSubstituter.replacePlaceholders(this.typescript, this.templateSettings, this.node);
        if (substitutions.length === 0) {
            return;
        }
        for (const substitution of substitutions) {
            if (substitution.start === start) {
                return substitution;
            }
        }
    }
}
__decorate([
    memoize_1.memoize
], StandardTemplateContext.prototype, "stringBodyOffset", null);
__decorate([
    memoize_1.memoize
], StandardTemplateContext.prototype, "stringBodyPosition", null);
__decorate([
    memoize_1.memoize
], StandardTemplateContext.prototype, "text", null);
__decorate([
    memoize_1.memoize
], StandardTemplateContext.prototype, "rawText", null);
__decorate([
    memoize_1.memoize
], StandardTemplateContext.prototype, "getSubstitution", null);
class StandardTemplateSourceHelper {
    constructor(typescript, templateStringSettings, helper, _logger) {
        this.typescript = typescript;
        this.templateStringSettings = templateStringSettings;
        this.helper = helper;
    }
    getTemplate(fileName, position) {
        const node = this.getValidTemplateNode(this.templateStringSettings, this.helper.getNode(fileName, position));
        if (!node) {
            return undefined;
        }
        // Make sure we are inside the template string
        if (position <= node.pos) {
            return undefined;
        }
        // Make sure we are not inside of a placeholder
        if (node.kind === this.typescript.SyntaxKind.TemplateExpression) {
            let start = node.head.end;
            for (const child of node.templateSpans.map(x => x.literal)) {
                const nextStart = child.getStart();
                if (position >= start && position <= nextStart) {
                    return undefined;
                }
                start = child.getEnd();
            }
        }
        return new StandardTemplateContext(this.typescript, fileName, node, this.helper, this.templateStringSettings);
    }
    getAllTemplates(fileName) {
        const out = [];
        for (const node of this.helper.getAllNodes(fileName, n => this.getValidTemplateNode(this.templateStringSettings, n) !== undefined)) {
            const validNode = this.getValidTemplateNode(this.templateStringSettings, node);
            if (validNode) {
                out.push(new StandardTemplateContext(this.typescript, fileName, validNode, this.helper, this.templateStringSettings));
            }
        }
        return out;
    }
    getRelativePosition(context, offset) {
        const baseLC = this.helper.getLineAndChar(context.fileName, context.node.getStart() + 1);
        const cursorLC = this.helper.getLineAndChar(context.fileName, offset);
        return nodes_1.relative(baseLC, cursorLC);
    }
    getValidTemplateNode(templateStringSettings, node) {
        if (!node) {
            return undefined;
        }
        switch (node.kind) {
            case this.typescript.SyntaxKind.TaggedTemplateExpression:
                if (nodes_1.isTagged(node, templateStringSettings.tags)) {
                    return node.template;
                }
                return undefined;
            case this.typescript.SyntaxKind.NoSubstitutionTemplateLiteral:
                if (nodes_1.isTaggedLiteral(this.typescript, node, templateStringSettings.tags)) {
                    return node;
                }
                return undefined;
            case this.typescript.SyntaxKind.TemplateHead:
                if (templateStringSettings.enableForStringWithSubstitutions && node.parent && node.parent.parent) {
                    return this.getValidTemplateNode(templateStringSettings, node.parent.parent);
                }
                return undefined;
            case this.typescript.SyntaxKind.TemplateMiddle:
            case this.typescript.SyntaxKind.TemplateTail:
                if (templateStringSettings.enableForStringWithSubstitutions && node.parent && node.parent.parent) {
                    return this.getValidTemplateNode(templateStringSettings, node.parent.parent.parent);
                }
                return undefined;
            default:
                return undefined;
        }
    }
}
exports.default = StandardTemplateSourceHelper;
