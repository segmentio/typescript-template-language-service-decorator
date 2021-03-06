"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
//
// Original code forked from https://github.com/Quramy/ts-graphql-plugin
Object.defineProperty(exports, "__esModule", { value: true });
class TemplateLanguageServiceProxy {
    constructor(typescript, sourceHelper, templateStringService, _logger) {
        this.typescript = typescript;
        this.sourceHelper = sourceHelper;
        this.templateStringService = templateStringService;
        this._wrappers = [];
        this.tryAdaptGetCompletionsAtPosition();
        this.tryAdaptGetCompletionEntryDetails();
        this.tryAdaptGetQuickInfoAtPosition();
        this.tryAdaptGetSemanticDiagnostics();
        this.tryAdaptGetSyntaxDiagnostics();
        this.tryAdaptGetFormattingEditsForRange();
        this.tryAdaptGetCodeFixesAtPosition();
        this.tryAdaptGetSupportedCodeFixes();
        this.tryAdaptGetDefinitionAtPosition();
        this.tryAdaptGetSignatureHelpItemsAtPosition();
        this.tryAdaptGetOutliningSpans();
        this.tryAdaptGetReferencesAtPosition();
        this.tryAdaptGetJsxClosingTagAtPosition();
    }
    decorate(languageService) {
        const intercept = Object.create(null);
        for (const { name, wrapper } of this._wrappers) {
            intercept[name] = wrapper(languageService[name].bind(languageService));
        }
        return new Proxy(languageService, {
            get: (target, property) => {
                return intercept[property] || target[property];
            },
        });
    }
    tryAdaptGetSyntaxDiagnostics() {
        if (!this.templateStringService.getSyntacticDiagnostics) {
            return;
        }
        const call = this.templateStringService.getSyntacticDiagnostics.bind(this.templateStringService);
        this.wrap('getSyntacticDiagnostics', delegate => (fileName) => {
            return this.adaptDiagnosticsCall(delegate, call, fileName);
        });
    }
    tryAdaptGetSemanticDiagnostics() {
        if (!this.templateStringService.getSemanticDiagnostics) {
            return;
        }
        const call = this.templateStringService.getSemanticDiagnostics.bind(this.templateStringService);
        this.wrap('getSemanticDiagnostics', delegate => (fileName) => {
            return this.adaptDiagnosticsCall(delegate, call, fileName);
        });
    }
    tryAdaptGetQuickInfoAtPosition() {
        if (!this.templateStringService.getQuickInfoAtPosition) {
            return;
        }
        this.wrap('getQuickInfoAtPosition', delegate => (fileName, position) => {
            const context = this.sourceHelper.getTemplate(fileName, position);
            if (!context) {
                return delegate(fileName, position);
            }
            const quickInfo = this.templateStringService.getQuickInfoAtPosition(context, this.sourceHelper.getRelativePosition(context, position));
            if (quickInfo) {
                return Object.assign({}, quickInfo, {
                    textSpan: {
                        start: quickInfo.textSpan.start + context.node.getStart() + 1,
                        length: quickInfo.textSpan.length,
                    },
                });
            }
            return delegate(fileName, position);
        });
    }
    tryAdaptGetCompletionsAtPosition() {
        if (!this.templateStringService.getCompletionsAtPosition) {
            return;
        }
        this.wrap('getCompletionsAtPosition', delegate => (fileName, position, ...rest) => {
            const context = this.sourceHelper.getTemplate(fileName, position);
            if (!context) {
                return delegate(fileName, position, ...rest);
            }
            return this.translateCompletionInfo(context, this.templateStringService.getCompletionsAtPosition(context, this.sourceHelper.getRelativePosition(context, position)));
        });
    }
    tryAdaptGetCompletionEntryDetails() {
        if (!this.templateStringService.getCompletionEntryDetails) {
            return;
        }
        this.wrap('getCompletionEntryDetails', delegate => (fileName, position, name, ...rest) => {
            const context = this.sourceHelper.getTemplate(fileName, position);
            if (!context) {
                return delegate(fileName, position, name, ...rest);
            }
            return this.templateStringService.getCompletionEntryDetails(context, this.sourceHelper.getRelativePosition(context, position), name);
        });
    }
    tryAdaptGetFormattingEditsForRange() {
        if (!this.templateStringService.getFormattingEditsForRange) {
            return;
        }
        this.wrap('getFormattingEditsForRange', delegate => (fileName, start, end, options) => {
            const templateEdits = [];
            for (const template of this.sourceHelper.getAllTemplates(fileName)) {
                const nodeStart = template.node.getStart() + 1;
                const nodeEnd = template.node.getEnd() - 1;
                if (end < nodeStart || start > nodeEnd) {
                    continue;
                }
                const templateStart = Math.max(0, start - nodeStart);
                const templateEnd = Math.min(nodeEnd - nodeStart, end - nodeStart);
                for (const change of this.templateStringService.getFormattingEditsForRange(template, templateStart, templateEnd, options)) {
                    templateEdits.push(this.translateTextChange(template, change));
                }
            }
            return [
                ...delegate(fileName, start, end, options),
                ...templateEdits,
            ];
        });
    }
    tryAdaptGetCodeFixesAtPosition() {
        if (!this.templateStringService.getCodeFixesAtPosition) {
            return;
        }
        this.wrap('getCodeFixesAtPosition', delegate => (fileName, start, end, errorCodes, options, preferences) => {
            const templateActions = [];
            for (const template of this.sourceHelper.getAllTemplates(fileName)) {
                const nodeStart = template.node.getStart() + 1;
                const nodeEnd = template.node.getEnd() - 1;
                if (end < nodeStart || start > nodeEnd) {
                    continue;
                }
                const templateStart = Math.max(0, start - nodeStart);
                const templateEnd = Math.min(nodeEnd - nodeStart, end - nodeStart);
                for (const codeAction of this.templateStringService.getCodeFixesAtPosition(template, templateStart, templateEnd, errorCodes, options)) {
                    templateActions.push(this.translateCodeAction(template, codeAction));
                }
            }
            return [
                ...delegate(fileName, start, end, errorCodes, options, preferences),
                ...templateActions,
            ];
        });
    }
    tryAdaptGetSupportedCodeFixes() {
        if (!this.templateStringService.getSupportedCodeFixes) {
            return;
        }
        const delegate = this.typescript.getSupportedCodeFixes.bind(this.typescript);
        this.typescript.getSupportedCodeFixes = () => {
            return [
                ...delegate(),
                ...this.templateStringService.getSupportedCodeFixes().map(x => '' + x),
            ];
        };
    }
    tryAdaptGetDefinitionAtPosition() {
        if (!this.templateStringService.getDefinitionAtPosition) {
            return;
        }
        this.wrap('getDefinitionAtPosition', delegate => (fileName, position, ...rest) => {
            const context = this.sourceHelper.getTemplate(fileName, position);
            if (context) {
                const definition = this.templateStringService.getDefinitionAtPosition(context, this.sourceHelper.getRelativePosition(context, position));
                return definition
                    ? definition.map(def => this.translateDefinitionInfo(context, def))
                    : undefined;
            }
            return delegate(fileName, position, ...rest);
        });
    }
    tryAdaptGetSignatureHelpItemsAtPosition() {
        if (!this.templateStringService.getSignatureHelpItemsAtPosition) {
            return;
        }
        this.wrap('getSignatureHelpItems', delegate => (fileName, position, ...rest) => {
            const context = this.sourceHelper.getTemplate(fileName, position);
            if (!context) {
                return delegate(fileName, position, ...rest);
            }
            const signatureHelp = this.templateStringService.getSignatureHelpItemsAtPosition(context, this.sourceHelper.getRelativePosition(context, position));
            return signatureHelp ? this.translateSignatureHelpItems(context, signatureHelp) : undefined;
        });
    }
    tryAdaptGetOutliningSpans() {
        if (!this.templateStringService.getOutliningSpans) {
            return;
        }
        this.wrap('getOutliningSpans', delegate => (fileName) => {
            const templateSpans = [];
            for (const template of this.sourceHelper.getAllTemplates(fileName)) {
                for (const span of this.templateStringService.getOutliningSpans(template)) {
                    templateSpans.push(this.translateOutliningSpan(template, span));
                }
            }
            return [
                ...delegate(fileName),
                ...templateSpans,
            ];
        });
    }
    tryAdaptGetReferencesAtPosition() {
        if (!this.templateStringService.getReferencesAtPosition) {
            return;
        }
        this.wrap('findReferences', delegate => (fileName, position, ...rest) => {
            const context = this.sourceHelper.getTemplate(fileName, position);
            if (context) {
                const references = this.templateStringService.getReferencesAtPosition(context, this.sourceHelper.getRelativePosition(context, position));
                if (references) {
                    return [{
                            definition: {
                                containerKind: this.typescript.ScriptElementKind.string,
                                containerName: '',
                                displayParts: [],
                                fileName,
                                kind: this.typescript.ScriptElementKind.string,
                                name: '',
                                textSpan: { start: position, length: 0 },
                            },
                            references: references.map(ref => this.translateReferenceEntry(context, ref)),
                        }];
                }
                return undefined;
            }
            return delegate(fileName, position, ...rest);
        });
    }
    tryAdaptGetJsxClosingTagAtPosition() {
        if (!this.templateStringService.getJsxClosingTagAtPosition) {
            return;
        }
        this.wrap('getJsxClosingTagAtPosition', delegate => (fileName, position, ...rest) => {
            const context = this.sourceHelper.getTemplate(fileName, position);
            if (context) {
                const closing = this.templateStringService.getJsxClosingTagAtPosition(context, this.sourceHelper.getRelativePosition(context, position));
                if (closing) {
                    return closing;
                }
            }
            return delegate(fileName, position, ...rest);
        });
    }
    wrap(name, wrapper) {
        this._wrappers.push({ name, wrapper });
        return this;
    }
    adaptDiagnosticsCall(delegate, implementation, fileName) {
        const baseDiagnostics = delegate(fileName);
        const templateDiagnostics = [];
        for (const context of this.sourceHelper.getAllTemplates(fileName)) {
            for (const diagnostic of implementation(context)) {
                templateDiagnostics.push(Object.assign(Object.assign({}, diagnostic), { start: context.node.getStart() + 1 + (diagnostic.start || 0) }));
            }
        }
        return [...baseDiagnostics, ...templateDiagnostics];
    }
    translateCompletionInfo(context, info) {
        return Object.assign(Object.assign({}, info), { entries: info.entries.map(entry => this.translateCompletionEntry(context, entry)) });
    }
    translateCompletionEntry(context, entry) {
        return Object.assign(Object.assign({}, entry), { replacementSpan: entry.replacementSpan ? this.translateTextSpan(context, entry.replacementSpan) : undefined });
    }
    translateTextChange(context, textChange) {
        return Object.assign(Object.assign({}, textChange), { span: this.translateTextSpan(context, textChange.span) });
    }
    translateFileTextChange(context, changes) {
        return {
            fileName: changes.fileName,
            textChanges: changes.textChanges.map(textChange => this.translateTextChange(context, textChange)),
        };
    }
    translateCodeAction(context, action) {
        return Object.assign(Object.assign({}, action), { fixName: action.fixName || '', changes: action.changes.map(change => this.translateFileTextChange(context, change)) });
    }
    translateSignatureHelpItems(context, signatureHelp) {
        return Object.assign(Object.assign({}, signatureHelp), { applicableSpan: this.translateTextSpan(context, signatureHelp.applicableSpan) });
    }
    translateOutliningSpan(context, span) {
        return Object.assign(Object.assign({}, span), { textSpan: this.translateTextSpan(context, span.textSpan), hintSpan: this.translateTextSpan(context, span.hintSpan) });
    }
    translateTextSpan(context, span) {
        return {
            start: context.node.getStart() + 1 + span.start,
            length: span.length,
        };
    }
    translateDefinitionInfo(context, definition) {
        return Object.assign(Object.assign({}, definition), { fileName: context.fileName, textSpan: this.translateTextSpan(context, definition.textSpan) });
    }
    translateReferenceEntry(context, entry) {
        return Object.assign(Object.assign({}, entry), { fileName: context.fileName, textSpan: this.translateTextSpan(context, entry.textSpan) });
    }
}
exports.default = TemplateLanguageServiceProxy;
