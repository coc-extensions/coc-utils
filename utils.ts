"use strict";

import fs = require("fs");
import os = require("os");
import path = require("path");
import {workspace} from 'coc.nvim';
import {Uri} from 'coc.nvim'
import {IncomingMessage} from 'http';

import { http, https } from "follow-redirects";

export type FstArg<T> = T extends (arg1: infer U, ...args: any[]) => any ? U : any
export type SndArg<T> = T extends (arg1: any, arg2: infer U, ...args: any[]) => any ? U : any

export type HttpsOpts = FstArg<typeof https.request>
export type HttpOpts = FstArg<typeof http.request>

export function fileURLToPath(x: string) {
    return Uri.parse(x).fsPath
}

export function sleep(ms: number) {
    return new Promise((resolve, __) => setTimeout(resolve, ms))
}

export function ensurePathExists(targetPath: string) {
    // Ensure that the path exists
    try {
        fs.mkdirSync(targetPath);
    } catch (e) {
        // If the exception isn't to indicate that the folder exists already, rethrow it.
        if (e.code !== "EEXIST") {
            throw e;
        }
    }
}

export function getPipePath(pipeName: string) {
    if (os.platform() === "win32") {
        return "\\\\.\\pipe\\" + pipeName;
    } else {
        // Windows uses NamedPipes where non-Windows platforms use Unix Domain Sockets.
        // This requires connecting to the pipe file in different locations on Windows vs non-Windows.
        return path.join(os.tmpdir(), `CoreFxPipe_${pipeName}`);
    }
}

export function checkIfFileExists(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.R_OK);
        return true;
    } catch (e) {
        return false;
    }
}

export function getTimestampString() {
    const time = new Date();
    return `[${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}]`;
}

export function isWindowsOS(): boolean {
    return os.platform() === "win32";
}

export async function getCurrentSelection(mode: string) {
    let doc = await workspace.document

    if (mode === "v" || mode === "V") {
        let [from,] = await doc.buffer.mark("<")
        let [to,] = await doc.buffer.mark(">")
        let result: string[] = []
        for (let i = from; i <= to; ++i) {
            result.push(doc.getline(i - 1))
        }
        return result
    }
    else if (mode === "n") {
        let line = await workspace.nvim.call('line', '.')
        return [doc.getline(line - 1)]
    }
    else if (mode === "i") {
        // TODO what to do in insert mode?
    }
    else if (mode === "t") {
        //TODO what to do in terminal mode?
    }

    return []
}

export function httpsGet<T>(
    url: HttpsOpts,
    cb: (resolve: (value?: T | PromiseLike<T>) => void,
        reject: (reason?: any) => void,
        res: IncomingMessage)
        => void) {
    return new Promise<T>((resolve, reject) => {
        const req = https.request(url, (res: IncomingMessage) => {
            if (res.statusCode != 200) {
                reject(new Error(`Invalid response from ${JSON.stringify(url)}: ${res.statusCode}`))
                return
            }
            cb(resolve, reject, res)
        })
        req.setHeader('user-agent', 'coc.nvim')
        req.on('error', reject)
        req.end()
    })
}

export function httpsGetJson<T>(url: HttpsOpts): Promise<T> {
    return httpsGet(url, (resolve, __, response) => {
        let data = ''
        response.on('data', chunk => data += chunk)
        response.on('end', () => {
            resolve(JSON.parse(data))
        })
    })
}
