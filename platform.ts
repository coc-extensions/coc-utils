/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {workspace, extensions, ExtensionContext} from 'coc.nvim'
import {httpsGet, httpsGetJson} from "./utils"
import fs = require("fs");
import path = require("path");
import process = require("process");
import {IncomingMessage, RequestOptions, Agent, get} from 'http'
import {parse} from 'url'
const tunnel = require('tunnel')
const unzip = require("extract-zip");
const rimraf = require("rimraf")

export enum OperatingSystem {
    Unknown,
    Windows,
    MacOS,
    Linux,
}

export interface IPlatformDetails {
    operatingSystem: OperatingSystem;
    isOS64Bit: boolean;
    isProcess64Bit: boolean;
}

export function getPlatformDetails(): IPlatformDetails {
    let operatingSystem = OperatingSystem.Unknown;

    if (process.platform === "win32") {
        operatingSystem = OperatingSystem.Windows;
    } else if (process.platform === "darwin") {
        operatingSystem = OperatingSystem.MacOS;
    } else if (process.platform === "linux") {
        operatingSystem = OperatingSystem.Linux;
    }

    const isProcess64Bit = process.arch === "x64";

    return {
        operatingSystem,
        isOS64Bit: isProcess64Bit || process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432"),
        isProcess64Bit,
    };
}

export function getPlatformSignature(): string {
    const plat = getPlatformDetails()

    const os_sig = (() => {
        switch (plat.operatingSystem) {
            case OperatingSystem.Windows: return "win"
            case OperatingSystem.Linux: return "linux"
            case OperatingSystem.MacOS: return "osx"
            default: return "unknown"
        }
    })()

    const arch_sig = (() => {
        if (plat.isProcess64Bit) return "x64"
        else return "x86"
    })()

    return `${os_sig}-${arch_sig}`
}

export interface ILanguageServerPackage {
    //  the executable of the language server, 
    //  in the downloaded and extracted package
    executable: string
    platformPath: string
}

export interface ILanguageServerPackages {
    [platform: string]: ILanguageServerPackage
}

export type LanguageServerRepository =
    | {kind: "github", repo: string, channel: string}
    | {kind: "url-prefix", url: string}

interface IGithubAsset {
    name: string
    browser_download_url: string
}

interface IGithubRelease {
    assets: IGithubAsset[]
}

export class LanguageServerProvider {
    private extensionStoragePath: string
    private languageServerName: string
    private languageServerDirectory: string
    private languageServerZip: string
    private languageServerExe: string
    private languageServerPackage: ILanguageServerPackage

    constructor(extension: ExtensionContext, name: string, packs: ILanguageServerPackages, private repo: LanguageServerRepository) {
        const platsig = getPlatformSignature()
        this.languageServerName = name
        this.extensionStoragePath = extension.storagePath
        this.languageServerPackage = packs[platsig]

        if (!this.languageServerPackage) {throw "Platform not supported"}

        this.languageServerDirectory = path.join(this.extensionStoragePath, "server")
        this.languageServerZip = this.languageServerDirectory + ".zip"
        this.languageServerExe = path.join(this.languageServerDirectory, this.languageServerPackage.executable)
    }

    async getDownloadUrl(platfile: string): Promise<string> {
        if (this.repo.kind === "github") {
            let {repo: repo, channel: channel} = this.repo
            let api_url = `https://api.github.com/repos/${repo}/releases/${channel}`
            let api_opts = parse(api_url)
            api_opts.agents = {
                https: new https.Agent()
            }
            let api_result = await httpsGetJson<IGithubRelease>(api_opts)
            let matched_assets = api_result.assets.filter(x => x.name === platfile)
            return matched_assets[0].browser_download_url
        } else if (this.repo.kind === "url-prefix") {
            return `${this.repo.url}/${platfile}`
        }
        throw new Error("unsupported repo kind.")
    }

    public async downloadLanguageServer(): Promise<void> {

        let item = workspace.createStatusBarItem(0, {progress: true})
        item.text = `Downloading ${this.languageServerName}`
        item.show()

        if (!fs.existsSync(this.extensionStoragePath)) {
            fs.mkdirSync(this.extensionStoragePath)
        }

        if (fs.existsSync(this.languageServerDirectory)) {
            rimraf.sync(this.languageServerDirectory)
        }

        let platfile = this.languageServerPackage.platformPath
        let url = await this.getDownloadUrl(platfile)

        fs.mkdirSync(this.languageServerDirectory)

        await httpsGet(url, (resolve, _, res) => {
            let file = fs.createWriteStream(this.languageServerZip)
            let stream = res.pipe(file)
            stream.on('finish', resolve)
        })

        await new Promise<void>((resolve, reject) => {
            unzip(this.languageServerZip, {dir: this.languageServerDirectory}, (err: any) => {
                if (err) reject(err)
                else resolve()
            })
        })

        fs.unlinkSync(this.languageServerZip)
        item.dispose()
    }

    // returns the full path to the language server executable
    public async getLanguageServer(): Promise<string> {

        const plat = getPlatformDetails()

        if (!fs.existsSync(this.languageServerExe)) {
            await this.downloadLanguageServer()
        }

        // Make sure the server is executable
        if (plat.operatingSystem !== OperatingSystem.Windows) {
            fs.chmodSync(this.languageServerExe, "755")
        }

        return this.languageServerExe
    }
}

