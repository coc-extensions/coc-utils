/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import coc = require("coc.nvim");
import {workspace} from 'coc.nvim'
import {sleep, getCurrentSelection} from './utils';

export class REPLProcess {

    public onExited: coc.Event<void>;
    private onExitedEmitter = new coc.Emitter<void>();
    private consoleTerminal: coc.Terminal = undefined;
    private consoleCloseSubscription: coc.Disposable;
    private log: coc.OutputChannel;

    constructor(private title: string, private progPath: string, private progArgs: string[]) {
        this.log = coc.workspace.createOutputChannel(title)
        this.onExited = this.onExitedEmitter.event;
    }

    public async start() {

        if (this.consoleTerminal) {
            this.log.appendLine(`${this.title} already started.`)
            this.consoleTerminal.show(true)
            return
        }

        this.log.appendLine(`${this.title} starting.`)

        this.consoleTerminal = await coc.workspace.createTerminal({
            name: this.title,
            shellPath: this.progPath,
            shellArgs: this.progArgs
        })

        this.consoleCloseSubscription =
            coc.workspace.onDidCloseTerminal(
                (terminal) => {
                    if (terminal === this.consoleTerminal) {
                        this.log.appendLine(`${this.title} terminated or terminal UI was closed`);
                        this.onExitedEmitter.fire();
                    }
                }, this);
    }

    public showConsole(preserveFocus: boolean) {
        if (this.consoleTerminal) {
            this.consoleTerminal.show(preserveFocus);
        }
    }

    public async eval(line: string) {
        if (this.consoleTerminal) {
            this.consoleTerminal.sendText(line)
        }
    }

    public async scrollToBottom() {
        this.consoleTerminal.show(false)
        await sleep(200)
        await coc.workspace.nvim.command("wincmd w")
    }

    public dispose() {

        if (this.consoleCloseSubscription) {
            this.consoleCloseSubscription.dispose();
            this.consoleCloseSubscription = undefined;
        }

        if (this.consoleTerminal) {
            this.log.appendLine(`Terminating ${this.title} process...`);
            this.consoleTerminal.dispose();
            this.consoleTerminal = undefined;
        }
    }
}

let currentREPL: REPLProcess = undefined
async function createREPL () {
    if(currentREPL) {
        currentREPL.dispose()
        currentREPL = undefined
    }
    currentREPL = new REPLProcess("F# REPL", "dotnet", ["fsi", "--readline+"]) 
    currentREPL.onExited(() => {
        currentREPL = undefined
    })
    await currentREPL.start()
    return currentREPL.onExited
}


export async function doEval(mode: string) {

    let document = await workspace.document
    if (!document || document.filetype !== 'fsharp') {
        return
    }

    if(!currentREPL) {
        await createREPL()
    }

    // TODO: move to workspace.getCurrentSelection when we get an answer:
    // https://github.com/neoclide/coc.nvim/issues/933
    const content = await getCurrentSelection(mode)
    for(let line of content){
        await currentREPL.eval(line)
    }
    await currentREPL.eval(";;")
    // see :help feedkeys
    await workspace.nvim.call('eval', `feedkeys("\\<esc>${content.length}j", "in")`)
    // await currentREPL.scrollToBottom()
}
