'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const DEBUG = false;

const debug = (...args) => {
    if (DEBUG) {
        console.log(...args);
    }
};

interface Token {
    text: string;
    start?: boolean;
    end?: boolean;
    inline?: boolean;
    line?: string;
}

const tokens: Token[] = [
    { text: 'BEGIN CASE', start: true },
    { text: 'BEGIN', start: true },
    { text: 'CASE', start: true },
    { text: 'FOR', start: true },
    { text: 'LOOP', start: true },
    { text: 'END ELSE', start: true, end: true },
    { text: 'ELSE', start: true },
    { text: 'THEN', start: true },
    { text: 'WHILE', start: true },
    { text: 'LOCKED', start: true },
    { text: 'TRY', start: true },
    { text: 'CATCH', start: true, end: true },

    // commands that may have ELSE or THEN statements (or blocks) following them
    { text: 'IF', start: true, inline: true },
    { text: 'GET', start: true, inline: true },
    { text: 'INPUT', start: true, inline: true },
    { text: 'LOCATE', start: true, inline: true },
    { text: 'LOCK', start: true, inline: true },
    { text: 'MATREAD', start: true, inline: true },
    { text: 'MATREADU', start: true, inline: true },
    { text: 'MATWRITE', start: true, inline: true },
    { text: 'MATWRITEU', start: true, inline: true },
    { text: 'OPEN', start: true, inline: true },
    { text: 'PROCREAD', start: true, inline: true },
    { text: 'PROCWRITE', start: true, inline: true },
    { text: 'READ', start: true, inline: true },
    { text: 'READNEXT', start: true, inline: true },
    { text: 'READSEQ', start: true, inline: true },
    { text: 'READT', start: true, inline: true },
    { text: 'READU', start: true, inline: true },
    { text: 'READV', start: true, inline: true },
    { text: 'READVU', start: true, inline: true },
    { text: 'RELEASE', start: true, inline: true },
    { text: 'REWIND', start: true, inline: true },
    { text: 'SEEK', start: true, inline: true },
    { text: 'UNTIL', start: true, end: true, inline: true },
    { text: 'WEOF', start: true, inline: true },
    { text: 'WRITESEQ', start: true, inline: true },
    { text: 'WRITET', start: true, inline: true },

    // ENDs
    { text: 'END CASE', end: true },
    { text: 'END', end: true },
    { text: 'NEXT', end: true },
    { text: 'REPEAT', end: true },
    // { text: 'RETURN', end: true },
];

const escapeRegExp = (str) => {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

// indent sizes
const margin = " ".repeat(5);
const indent = " ".repeat(3);

// track if in case block
let caseLevel = 0;

const removeQuotedStrings = (text) => {
    const doubleRegex = /\\"|"(?:\\"|[^"])*"|(\+)/g;
    const singleRegex = /\\'|'(?:\\'|[^'])*'|(\+)/g;

    return text.replace(doubleRegex, '').replace(singleRegex, '');
};

const getTrailingComment = (text) => {
    // remove quoted delimiters
    text = removeQuotedStrings(text);

    if (!text.match(/;\s*\*/)) {
        return null;
    }

    return /;\s*(\*.*)$/.exec(text)[1];
};

const removeTrailingComment = (text) => {
    const comment = getTrailingComment(text);

    if (comment) {
        return text.replace(comment, '').trim();
    }

    return text;
};

const getLabel = (text) => {
    const matches = /^(\w+:|\d+)/.exec(text);

    if (!matches) {
        return null;
    }

    return matches[1];
}

const isBlockStart = (text) => {
    text = text.trim();

    if (text[0] === '!') {
        // Ignore bang (ifdef) statements
        return false;
    }

    const label = getLabel(text);
    if (label) {
        text = text.substring(label.length).trim();
    }

    for (const token of tokens) {
        if (!token.start) {
            continue;
        }
        const re = new RegExp(`^${escapeRegExp(token.text)}(\\s|$|\\()`);

        if (re.exec(text)) {

            if (token.inline) {
                text = removeTrailingComment(removeQuotedStrings(text));
                token.line = text;
                return /\s(THEN|ELSE|DO|LOCKED)\s*;?$/.exec(text) ? token : false;
            }

            if (token.text === 'CASE') {
                text = removeTrailingComment(removeQuotedStrings(text));
                caseLevel++;
                return token;
            }

            return token;
        }
    }

    return false;
};

const isBlockEnd = (text) => {
    text = text.trim();

    if (text[0] === '!') {
        // Ignore bang (ifdef) statements
        return false;
    }

    for (const token of tokens) {
        if (!token.end) {
            continue;
        }

        const re = new RegExp(`^${escapeRegExp(token.text)}(\\s|$|\\()`);

        if (re.exec(text)) {
            if (token.text === 'END CASE') {
                caseLevel--;
            } else if (token.text === 'CASE') {
                text = removeTrailingComment(removeQuotedStrings(text));
                // if we are in a case block, treat as end block
                const ret = (caseLevel) ? token : false;
                caseLevel--;
                return ret;
            }

            return token;
        }
    }

    return false;
};

const getToken = (text) => {
    const start = isBlockStart(text);
    if (start) {
        return start;
    }

    const end = isBlockEnd(text);
    if (end) {
        return end;
    }

    return { text: '', start: false, end: false };
};

const formatLine = (text, nestLevel) => {
    text = text.trim();

    // IFDEF stuff
    if (text[0] === '!') {
        return text;
    }

    const label = getLabel(text) || '';

    if (label.length) {
        // remove label, readd before margin below
        text = text.substring(label.length).trim();
    }

    return `${label}${margin.substring(label.length)}${indent.repeat(nestLevel)}${text}`
};

const formatFile = (document) => {
    // indent nest level
    let nestLevel = 0;

    const caseStack = [];

    const inCase = () => {
        return caseStack[caseStack.length - 1]
    };

    // edits list to be returned
    const result = [];


    const lines = document.getText().trim().split('\n');

    for (let i = 0; i < document.lineCount; i++) {

        const line = document.lineAt(i);
        let text = line.text.trim();

        if (!text) {
            if (text !== line.text) {
                // line has some unneeded spaces
                result.push(vscode.TextEdit.replace(line.range, text));
            }
            continue;
        }

        const token = getToken(text);

        if (token.start) {
            debug('S', i + 1, nestLevel, text);
        }

        // CASE is a special CASE
        if (
            !(token.text === 'RETURN' && inCase()) &&
            (token.end || (token.text === 'CASE' && inCase()))
        ) {

            // decrease nesting an additinal level on END CASE in CASE block
            if (token.text === 'END CASE' && inCase()) {
                nestLevel -= 1;
            }

            nestLevel -= 1;
            debug('E', i + 1, nestLevel, text);
            debug(token.text, inCase(), caseStack.length);
        }

        if (token.text === 'BEGIN CASE') {
            caseStack.push(false);
        } else if (token.text === 'CASE') {
            if (caseStack.length < 1) {
                throw new Error(`Unexpected case at line ${i}`);
            }
            caseStack[caseStack.length - 1] = true;
        } else if (token.text === 'END CASE') {
            caseStack.pop();
        }

        // RETURN is ok if used on level 0
        if (token.text === 'RETURN' && nestLevel < 0) {
            nestLevel = 0;
        }

        // END is required at the end of a file
        if (i === lines.length - 1 && token.text === 'END') {
            nestLevel = 0;
        }

        text = formatLine(text, nestLevel);

        if (text !== line.text) {
            result.push(vscode.TextEdit.replace(line.range, text));
        }

        if (token.start) {
            if (token.text === 'UNTIL' && token.line.endsWith('REPEAT') && token.end && token.start) {
                // HACK: ending LOOP block AND until, don't increment level
                debug('UNTIL INLINE LOOP END');
            } else {
                nestLevel += 1;
            }
        }

        if (nestLevel < 0) {
            vscode.window.showInformationMessage(`Format: nest less than zero on line ${i + 1}`);
            return;
        }
    }

    return result;
};

export function activate(context: vscode.ExtensionContext) {
    vscode.languages.registerDocumentFormattingEditProvider('pick', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            if (!document.lineCount) {
                return;
            }

            try {
                const result = formatFile(document);
                debug('Changes:', result.length);
                if (!result || !result.length) {
                    return;
                }
                return result;
                // return [vscode.TextEdit.replace(document.validateRange(new vscode.Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE)), newText)]
            } catch (e) {
                vscode.window.showInformationMessage(`Formatter Error: ${e.message}`);
                console.log(e);
                return;
            }
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() { }
