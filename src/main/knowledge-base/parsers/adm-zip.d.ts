declare module 'adm-zip' {
  class AdmZip {
    constructor(fileNameOrRawData?: string | Buffer)
    getEntries(): Array<{
      entryName: string
      getData(): Buffer
      isDirectory: boolean
    }>
    readAsText(entry: string | object, encoding?: string): string
    extractAllTo(targetPath: string, overwrite?: boolean): void
  }
  export = AdmZip
}
