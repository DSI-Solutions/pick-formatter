'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

interface Token {
    text: string;
    start?: boolean;
    end?: boolean;
    inline?: boolean;
}

const tokens: Token[] = [
    { text: 'BEGIN', start: true },
    { text: 'CASE', start: true },
    { text: 'FOR', start: true },
    { text: 'LOOP', start: true },
    { text: 'END ELSE', start: true },
    { text: 'ELSE', start: true },
    { text: 'THEN', start: true },
    { text: 'UNTIL', start: true },
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
    { text: 'WEOF', start: true, inline: true },
    { text: 'WRITESEQ', start: true, inline: true },
    { text: 'WRITET', start: true, inline: true },

    // ENDs
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

const isBlockStart = (text) => {
    text = text.trim();
    for (const token of tokens) {
        if (!token.start) {
            continue;
        }
        const re = new RegExp(`^${escapeRegExp(token.text)}(\\s|$)`);

        if (re.exec(text)) {
            if (token.inline) {
                return (text.endsWith('THEN') || text.endsWith('ELSE')) ? token.text : false;
            }

            if (token.text === 'CASE') {
                return (!text.includes(';')) ? token.text : false;
            }

            return token.text;
        }
    }

    return false;
};

const isBlockEnd = (text) => {
    text = text.trim();
    for (const token of tokens) {
        if (!token.end) {
            continue;
        }
        if (text.startsWith(token.text)) {
            return token.text;
        }
    }

    return false;
};

const formatLine = (text, nestLevel) => {
    text = text.trim();
    // comment
    if (text[0] === '!') {
        return text;
    }

    // label
    if (text.match(/^\w+:(\n|$)/)) {
        return text;
    }

    return `${margin}${indent.repeat(nestLevel)}${text}`
};

const formatFile = (document) => {
    // indent nest level
    let nestLevel = 0;

    // edits list to be returned
    const result = [];

    const lines = document.getText().trim().split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const incLevel = (!!isBlockStart(line));

        const endBlock = isBlockEnd(line);
        if (endBlock) {
            nestLevel -= 1;
        }

        // RETURN is ok if used on level 0
        if (endBlock === 'RETURN' && nestLevel < 0) {
            nestLevel = 0;
        }

        // END is required at the end of a file
        if (i === lines.length - 1 && endBlock === 'END') {
            nestLevel = 0;
        }

        if (nestLevel < 0) {
            vscode.window.showInformationMessage(`Format: nest less than zero on line ${i + 1}`);
            return;
        }

        result.push(formatLine(line, nestLevel));

        if (incLevel) {
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
