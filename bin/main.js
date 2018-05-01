#!/usr/bin/env node
const GCMParser = require('../gcmTool').GCMParser;
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const isoPath = process.argv[2];
const outputFolder = process.argv[3];
console.log("Extracting all files from:", isoPath, "to:", outputFolder);

function extractAllFiles(output, data) {
    output.fst.dataSectionOffsets.forEach(element => {
        const fileOutputPath = path.join(outputFolder,element.path);
        if (element.flags === 1) {
            console.error('Folder:',element);
            if (!fs.existsSync(fileOutputPath)){
                mkdirp.sync(fileOutputPath);
            }
        }
        mkdirp.sync(path.dirname(fileOutputPath));
        if (element.flags !== 0) return;
        const fileData = data.slice(element.fileOffset, element.fileOffset + element.fileSize);
        // console.error(element.path, element.fileOrParentOffset, element.numberOfFilesOrFileSize, fileData[0], fileData[1], fileData[2], fileData[3], fileData.length, element.flags);
        fs.writeFile(fileOutputPath, fileData, function(err) {
                if(err) {
                    return console.error(err, element.fileName);
                }
                
                console.error("The file was saved!",element.fileName);
        });
    });
    
    const dolOutputPath = path.join(outputFolder, 'boot.dol');
    const dolData = data.slice(output.dolloaderStartOffset, output.dolloaderEndOffset);
    fs.writeFile(dolOutputPath, dolData, function(err) {
        if(err) {
            return console.error(err, element.fileName);
        }
        
        console.error("The DOL file was saved!", dolOutputPath);
    });
}

fs.readFile(isoPath, function(err, data) {
    const output = GCMParser.parse(data);

    if (!fs.existsSync(outputFolder)){
        fs.mkdirSync(outputFolder);
        mkdirp.sync(outputFolder+"/root");
    }
    extractAllFiles(output, data);
    console.log('done');
});