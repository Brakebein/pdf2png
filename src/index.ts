import { exec } from "child_process";
import path from "path";
import tmp from "tmp";
import axios from "axios";
import { readFile, unlink, writeFile } from "fs/promises";



export default class PDFConvert {

    options: any;
    source: Buffer | string;
    tempLocation: string | undefined;
    ghostscriptPath = path.join(__dirname, "executables", "ghostScript");

    /**
     * Constructs a new Convert Object
     * @param source Can be either the buffer of the data, or a web url of the file
     * @param options ghostScript Options
     */
    constructor(source: Buffer | string, options?: any) {
        this.source = source;
        this.options = options;
        process.env.Path += ";" + this.ghostscriptPath;
    }

    
    public convertPageToImage = (page: number): Promise<Buffer> => new Promise((resolve, reject) => {

        tmp.file({}, async (err, name, fd) => {

            if(err)
                return reject(`Unable to open tmp file for page: ` + err);

            try {

                const cmd = `gs -dQUIET -dPARANOIDSAFER -dBATCH -dNOPAUSE -dNOPROMPT -sDEVICE=png16m -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r100 -dFirstPage=${page} -dLastPage=${page} -sOutputFile=${name} ${this.tempLocation}`
                exec(cmd, async (err, stdout, stderr) => {

                    if(err)
                        return reject("Error processing pdf to image: " + err);
                    
                    const buffer = await readFile(name);
                    await unlink(name);
                    return resolve(buffer);

                })

            } catch (e) {
                return reject(`Unable to process image from page: ` + e);
            }//end try catch

        });

    });

    /**
     * Gets the page count of the pdf
     * @returns number of pages in the pdf
     */
    public getPageCount = (): Promise<number> => new Promise(async (resolve, reject) => {

        // If the file wasn't yet written to temp location, we need to do that
        if(!this.tempLocation) {
            try {
                this.tempLocation = await this.writePDFToTemp();
            } catch (e) {
                return reject("Unable to get page count, " + e);
            }//end try catch
        }//end if
        
        const cmd = `gs -q -dNODISPLAY -c "(${this.tempLocation.replace(/\\/g, "/")}) (r) file runpdfbegin pdfpagecount = quit"`;

        exec(cmd, (err, stdout, stderr) => {

            if(err)
                return reject("Unable to get page count, " + err);

            //Remove the \n at the end
            const pageCount = parseInt(stdout.substr(0, stdout.length - 1))

            return resolve(pageCount);

        })

    });

    /**
     * Writes the source file to a tmp location
     * @returns Filename
     */
    private writePDFToTemp = (): Promise<string> => new Promise( async (resolve, reject) => {

        let file: Buffer;

        // If this is a web path then use axios to fetch the file
        if(typeof(this.source) === "string") {
            
            try {

                const response = await axios({
                    url: this.source,
                    method: 'GET',
                    responseType: 'blob'
                })

                file = response.data;

            } catch (e) {
                return reject("Unable to fetch file from web location: " + e);
            }//end try catch

        } else {
            file = this.source;
        }//end if else

        tmp.file({}, async (err, name, fd) => {

            if(err)
                return reject(`Unable to open tmp file: ` + err);

            try {
                await writeFile(name, file);
                return resolve(name);
            } catch (e) {
                return reject(`Unable to write tmp file: ` + e);
            }//end try catch

        })

    });

    /**
     * Removes the temp file created for the PDF conversion
     * This should be called manually in case you want to do multiple operations
     */
    public clean = (): Promise<void> => {
        if(this.tempLocation)
            return unlink(this.tempLocation)
        else
            return Promise.resolve();
    }//end ()

}