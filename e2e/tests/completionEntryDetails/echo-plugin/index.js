// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// @ts-check
const createPlugin = require('../../../_plugin');
const ts = require('../../../../node_modules/typescript/lib/tsserverlibrary');

/**
 * @implements {TemplateLanguageService}
 */
class TestStringLanguageService {
    getCompletionEntryDetails({ text }, position, name) {
        let line = text.split(/\n/g)[position.line];
        return {
            name,
            kind: 'class',
            kindModifiers: 'echo',
            documentation: [
                { text: line.slice(0, position.character), kind: 'text'}
            ]
        }
    }
}

module.exports = createPlugin(
    (_log) => {
        return new TestStringLanguageService()
    }, {
        tags: ['test'],
        enableForStringWithSubstitutions: true,
        getSubstitution(text, start, end) {
            return 'x'.repeat(end - start);
        }
    })