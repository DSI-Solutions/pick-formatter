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
    { text: 'RETURN', end: true },
];

const escapeRegExp = (str) => {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

// indent sizes
const margin = " ".repeat(5);
const indent = " ".repeat(3);

const removeQuotedStrings = (text) => {
    const doubleRegex = /\\"|"(?:\\"|[^"])*"|(\+)/g;
    const singleRegex = /\\'|'(?:\\'|[^'])*'|(\+)/g;

    return text.replace(doubleRegex, '').replace(singleRegex, '');
};

const getTrailingComment = (text) => {
    const doubleRegex = /\\"|"(?:\\"|[^"])*"|(\+)/g;
    const singleRegex = /\\'|'(?:\\'|[^'])*'|(\+)/g;

    // remove quoted delimiters
    text = removeQuotedStrings(text);

    if (!text.includes('*')) {
        return null;
    }

    return /(\*.*)$/.exec(text)[1];
};

const removeTrailingComment = (text) => {
    const comment = getTrailingComment(text);

    if (comment) {
        return text.replace(comment, '').trim();
    }

    return text;
};

const isLabel = (text) => {
    return (!!text.match(/^(\w+:|\d+)/));
}

const isBlockStart = (text) => {
    text = text.trim();

    if (text[0] === '!') {
        // Ignore bang (ifdef) statements
        return false;
    }

    for (const token of tokens) {
        if (!token.start) {
            continue;
        }
        const re = new RegExp(`^${escapeRegExp(token.text)}(\\s|$|\\()`);

        if (re.exec(text)) {

            if (token.inline) {
                text = removeTrailingComment(text);
                return /\s(THEN|ELSE|DO)$/.exec(text) ? token : false;
            }

            if (token.text === 'CASE') {
                text = removeTrailingComment(removeQuotedStrings(text));
                return (!text.includes(';') || text.endsWith(';')) ? token : false;
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

        if (text.startsWith(token.text)) {
            if (token.text === 'CASE') {
                text = removeTrailingComment(removeQuotedStrings(text));
                return (!text.includes(';')) ? token : false;
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

    if (isLabel(text)) {
        return text;
    }

    return `${margin}${indent.repeat(nestLevel)}${text}`
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
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!line.trim()) {
            // line is blank
            result.push('');
            continue;
        }

        const token = getToken(line);

        if (token.start) {
            debug('S', i + 1, nestLevel, line);
        }

        // CASE is a special CASE
        if (token.end || (token.text === 'CASE' && inCase())) {

            // decrease nesting an additinal level on END CASE in CASE block
            if (token.text === 'END CASE' && inCase()) {
                nestLevel -= 1;
            }

            nestLevel -= 1;
            debug('E', i + 1, nestLevel, line);
            debug(token.text, inCase(), caseStack);
        }

        if (token.text === 'BEGIN CASE') {
            caseStack.push(false);
        } else if (token.text === 'CASE') {
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

        if (nestLevel < 0) {
            vscode.window.showInformationMessage(`Format: nest less than zero on line ${i + 1}`);
            return;
        }

        result.push(formatLine(line, nestLevel));

        if (token.start) {
            nestLevel += 1;
        }
    }

    return result.join('\n') + '\n';
};

export function activate(context: vscode.ExtensionContext) {
    vscode.languages.registerDocumentFormattingEditProvider('pick', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            if (!document.lineCount) {
                return;
            }

            const newText = formatFile(document);

            if (!newText) {
                return;
            }

            return [vscode.TextEdit.replace(document.validateRange(new vscode.Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE)), newText)]
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() { }
