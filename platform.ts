import process = require("process");

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

