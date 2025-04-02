import { URL } from 'node:url';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import tmp, { FileResult } from 'tmp-promise';
import axios from 'axios';
import { exec, execFile } from './child-process';

export interface PdfConvertOptions {
  /**
   * Resolution of the output image in dpi.
   * @default 600
   */
  resolution?: number;
  /**
   * Path to ghostscript bin directory.
   * @default Included Windows version
   */
  ghostscriptPath?: string;
}

export class PdfConvert {
  private readonly options: Required<PdfConvertOptions>;

  private readonly source: Buffer | string;

  private tmpFile: FileResult | undefined;

  /**
   * Constructs a new Convert Object
   * @param source Can be either the buffer of the data, a file path, or a web url to a file.
   * @param options Configuration object
   */
  constructor(source: Buffer | string, options?: PdfConvertOptions) {
    this.source = source;

    this.options = {
      resolution: 600,
      ghostscriptPath: new URL(
        './executables/ghostscript',
        import.meta.url,
      ).pathname.replace(/^\//, ''),
      ...options,
    };

    if (process.platform === 'win32') {
      const suffix = ';' + this.options.ghostscriptPath;
      // Path or PATH
      const key = process.env.Path ? 'Path' : 'PATH';
      if (
        !new RegExp(suffix.replace('/', '\\/')).test(process.env[key] || '')
      ) {
        process.env[key] += suffix;
      }
    }
  }

  /**
   * Convert a page to a png image.
   * @param page Page number
   * @return png image as buffer
   */
  async convertPageToImage(page: number): Promise<Buffer> {
    await this.writePDFToTemp();

    if (!this.tmpFile) {
      throw new Error('No temporary pdf file!');
    }

    try {
      const tmpImage = await tmp.file();

      await execFile('gs', [
        '-dQUIET',
        '-dPARANOIDSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOPROMPT',
        '-sDEVICE=png16m',
        '-dTextAlphaBits=4',
        '-dGraphicsAlphaBits=4',
        `-r${this.options.resolution}`,
        `-dFirstPage=${page}`,
        `-dLastPage=${page}`,
        `-sOutputFile=${tmpImage.path}`,
        this.tmpFile.path,
      ]);

      const buffer = await readFile(tmpImage.path);
      await tmpImage.cleanup();

      return buffer;
    } catch (err) {
      throw new Error('Unable to process image from page: ' + err);
    }
  }

  /**
   * Gets the page count of the pdf.
   * @returns Number of pages in the pdf.
   */
  async getPageCount(): Promise<number> {
    await this.writePDFToTemp();

    if (!this.tmpFile) {
      throw new Error('No temporary pdf file!');
    }

    try {
      const { stdout } = await exec(
        `gs -q -dNODISPLAY -c "(${this.tmpFile.path.replace(
          /\\/g,
          '/',
        )}) (r) file runpdfbegin pdfpagecount = quit"`,
      );

      // remove the \n at the end
      return stdout
        ? parseInt(stdout.toString().substr(0, stdout.length - 1))
        : 0;
    } catch (err) {
      throw new Error('Unable to get page count: ' + err);
    }
  }

  /**
   * Writes the source file to a tmp location.
   */
  private async writePDFToTemp(): Promise<void> {
    if (this.tmpFile) return;

    // create tmp file
    try {
      this.tmpFile = await tmp.file();
    } catch (err) {
      throw new Error(`Unable to open tmp file: ` + err);
    }

    if (typeof this.source === 'string') {
      if (/^https?:\/\//.test(this.source)) {
        // if this is a web path then use axios to fetch the file
        try {
          const response = await axios.get(this.source, {
            responseType: 'stream',
          });

          const stream = createWriteStream(this.tmpFile.path);
          response.data.pipe(stream);

          await new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
          });
        } catch (err) {
          throw new Error('Unable to fetch file from web location: ' + err);
        }
      } else {
        // otherwise it must be a file reference
        await copyFile(this.source, this.tmpFile.path);
      }
    } else {
      // write buffer to file
      try {
        await writeFile(this.tmpFile.path, this.source);
      } catch (err) {
        throw new Error('Unable to write tmp file: ' + err);
      }
    }
  }

  /**
   * Removes the temp file created for the PDF conversion.
   * This should be called manually in case you want to do multiple operations.
   */
  async dispose(): Promise<void> {
    if (this.tmpFile) {
      await this.tmpFile.cleanup();
      this.tmpFile = undefined;
    }
  }
}
