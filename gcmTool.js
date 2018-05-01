const Parser = require('binary-parser').Parser;

// Good for debug:   .skip(function(a,b,c) { console.error('Offset:',offset, '0x'+offset.toString(16)); return 0; });

global.FLAG_DIRECTORY = 1;

const zeroPadding = {
    type: "uint8",
    formatter: function(arr) {
        return arr.reduce((a,b)=>a+b);
    },
    assert: 0
}

const hexFormatter = (value)=> '0x'+value.toString(16);
const hexArrayFormatter = (valueArr)=> valueArr.map(value=>'0x'+value.toString(16));

function round32(x)
{
    return Math.ceil(x/32)*32;
}

function calculateDolLength() {
  const dataSectionSizes = this.textSectionSizes.concat(this.dataSectionSizes);
  const totalLength = dataSectionSizes.reduce((a,b)=>a+b);
  return totalLength;
}


const _32K = 0x8000;

const GCMDiscHeader = new Parser()
  .endianess("big")
  .string('systemID', {length:1})
  .string('gameID', {length:2})
  .string('regionCode', {length:1})
  .string('makerCode', {length:2})
  .int8('diskID')
  .int8('version')
  .int8('streaming')
  .int8('streamBufSize')
  .skip(18)
  .uint32('DVDMagicWord', { assert: 0xc2339f3d })
  .string('gameName', {length:0x03e0, formatter: (name)=>name.replace(/[\u0000]/g,'')})
  .uint32('debugMonitorOffset', {length:4})
  .uint32('debugMonitorAddress', {length:4, formatter: hexFormatter})
  .array("padding", Object.assign({}, zeroPadding, {length:24}))
  .int32('dolOffset', {length:4, formatter: hexFormatter})
  .int32('fileSystemTableOffset', {length:4, formatter: hexFormatter })
  .int32('fileSystemTableSize', {length:4})
  .int32('fileSystemTableSizeMax', {length:4})
  .int32('userPosition', {length:4})
  .int32('userLength', {length:4})
  .int32('unknown2', {length:4})
  .uint32('unused', {length:4, assert:0})
  .skip(function(vars,b,c) { global.fileNumber=0; return 0; });

const GCMFileSystemTableEntry = new Parser()
  .endianess("big")
  .uint8('flags')
  .array('fileNameOffset', {
    type: 'uint8', 
    length:3, 
    formatter: function(value) {
      return +('0x'+value.join(''));
    }})
  .choice(("data", {
    tag: "flags",
    choices: {
      0: new Parser()
        .endianess("big")
        .uint32('fileOffset')
        .uint32('fileSize'),
        // .skip(function(vars) {vars.parentPaths[this.fileNumber] = vars.parentPaths[this.parentOffset]}),
      1: new Parser()
        .endianess("big")
        .uint32('parentOffset')
        .uint32('numberOfFiles')
    }
  }))  
  .skip(function() {this.isoOffset = offset; this.entryNumber=global.fileNumber+1; global.fileNumber++; return 0;})


const GCMFileSystemFilename = new Parser()
  .endianess("big")
  .string('name', {zeroTerminated:true})
  .skip(function(vars) {
    if ( !vars.startOffset) {
      vars.startOffset = offset; 
      vars.allNames = [];
    }
    if (!this.name) return 0;

    vars.allNames.push(this.name);
    return 0;
  })

const GCMFileSystemTable = new Parser()
  .endianess("big")
  .uint8('flags', {formatter: hexFormatter})
  .array('fileNameOffset', {
      type: 'uint8', 
      length:3, 
    formatter: function(value) {
      const reversed = value.reverse();
      return +('0x'+reversed.join(''));
    }})
  .uint32('fileOrParentOffset')
  .uint32('numberOfFiles')
  .array("dataSectionOffsets", {
    type: GCMFileSystemTableEntry,
    length:function() {return this.numberOfFiles-1;}
  })
  .array("fileNames", {
    type: GCMFileSystemFilename,
    length:function() {return this.numberOfFiles-1;}
  })
  .string('shouldBeString',{length:0xFF})
  .skip(function addFileNamesAndPathsToDataSectionEntries() {
      this.filePaths = {0:'root'};
      let previousDirectory='root';
      let previousDirectoryFileNumber=0;
      let previousDirectories=[];
      this.dataSectionOffsets = this.dataSectionOffsets.map( v=> {
      if (!vars.allNames) { return v; }
      
        v.fileName = vars.allNames.shift();
        
        if (v.flags === 1) {
          v.path = this.filePaths[v.parentOffset]+'/'+v.fileName;
          previousDirectory=v.path;
          previousDirectoryFileNumber = v.numberOfFiles;
          previousDirectories.push(previousDirectory);
        }
        else {
          
          if (v.entryNumber >= previousDirectoryFileNumber) {
            console.error('WARNING the file:',v.fileName,'May be in wrong directory');
            previousDirectory = previousDirectories.pop();
          }
          v.path = previousDirectory + '/'+ v.fileName;
        }
        this.filePaths[v.entryNumber] = v.path;
        
      return v;
    } )})

  .skip(function(vars,b,c) { vars.fstEndOffset=offset+' 0x'+offset.toString(16); console.error('Offset:',offset, '0x'+offset.toString(16)); return 0; });



const GCMDolFile = new Parser()
  .endianess("big")
  .skip(function(vars,b,c) { vars.dolloaderStartOffset=offset; return 0; })
  .uint32('text0', {assert:256})
  .array("textSectionOffsets", {
    type: "uint32be",
    length:6
  })
  .array("dataSectionOffsets", {
    type: "uint32be",
    length:11
  })
  .uint32('text0LoadingAddress', {formatter: hexFormatter})
  .array("textLoadingAddress", {
    type: "uint32be",
    length:6
  })
  .array("dataSectionLoadingAddress", {
    type: "uint32be",
    formatter: hexArrayFormatter,
    length:11
  })
  .array("textSectionSizes", {
    type: "uint32be",
    length:7
  })
  .array("dataSectionSizes", {
    type: "uint32be",
    length:11
  })
  .uint32('bssAddress', {formatter: hexFormatter})
  .uint32('bssSize', {formatter: hexFormatter})
  .uint32('entryPoint', {formatter: hexFormatter})
  .array("padding", Object.assign({}, zeroPadding, {length:0x1B}))
  .buffer('dolContent', {length: calculateDolLength} )
  .array("zeros", {
    type: "uint8",
    formatter: function(arr) {
        return arr.reduce((a,b)=>a+b);
    },
    assert: 0,
    readUntil: function(item, buffer) {
      return buffer[0] !==0;
    }
  })
  .skip(function(vars,b,c) { vars.dolloaderEndOffset=offset; return 0; });


const GCMAppLoader = new Parser()
  .endianess("big")
  .string('appLoaderDate', {length:10})
  .array("padding", Object.assign({}, zeroPadding, {length:6}))
  .uint32('apploaderEntryPoint', {formatter: hexFormatter})
  .uint32('sizeOfApploader')
  .int32('trailerSize')
  .array('apploaderAndTrailer', {type:'uint8', length:function(vars,b) {const x= this.sizeOfApploader+this.trailerSize; return x;}, formatter:function(vars,b) {return offset.toString(16);} })
  .array("zeros", {
    type: "uint8",
    formatter: function(arr) {
        return arr.reduce((a,b)=>a+b);
    },
    assert: 0,
    readUntil: function(item, buffer) {
      return buffer[2] !==0;
    }
  })
  .skip(function(vars,b,c) { vars.apploaderEndOffset=offset+' 0x'+offset.toString(16); console.error('Offset:',offset, '0x'+offset.toString(16)); return 0; });


const GCMDiscHeaderInformation = new Parser()
  .endianess("big")
  .uint32('debugMonitorSize', {length:4})
  .uint32('simulatedMemorySize', {length:4})
  .uint32('argumentOffset', {length:4})
  .uint32('DebugFlag', {length:4})
  .uint32('trackLocation', {length:4})
  .uint32('trackSize', {length:4})
  .uint32('countryCode', {length:4})
  .uint32('unknown', {length:4})
  .uint32('unknown2', {length:4})
  .array("zeros", {
    type: "uint8",
    formatter: function(arr) {
        return arr.reduce((a,b)=>a+b);
    },
    assert: 0,
    readUntil: function(item, buffer) {
      return offset === 0x2440;
    }
  });



const GCMParser = new Parser()
  .endianess("big")
  .nest('bootbin',{type:GCMDiscHeader})
  .nest('di2bin',{type:GCMDiscHeaderInformation})
  .nest('appldrbin',{type:GCMAppLoader})
  .nest('dol',{type:GCMDolFile})
  .nest('fst',{type:GCMFileSystemTable})
  .skip(function(a,b,c) { console.error('Last Offset:',offset, '0x'+offset.toString(16)); return 0; });

module.exports.GCMParser = GCMParser;
  