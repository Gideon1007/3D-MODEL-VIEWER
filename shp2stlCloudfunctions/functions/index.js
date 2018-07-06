const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')();
//const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');
const shp2stl = require('shp2stl');

//generate stl file on upload of geojson, shp file upload
exports.generateSTL = functions.storage.object().onFinalize((object) => {
    const fileBucket = object.bucket;//storage bucket that contains the file
    const filePath = object.name;//file path in the bucket
    console.log('filepath: ' + filePath);
    const contentType = object.contentType;//file content type
    console.log('contentType: ' + contentType);
    const metageneration = object.metageneration;


    //exit if this is triggered on file that is not a geojson(json) or shapefile
    if(!(contentType.endsWith('/json') || contentType.endsWith('/geojson'))){
        console.log('This is not valid file.');
        if(!contentType.endsWith('/stl')){
            gcs.bucket(fileBucket).file(filePath).delete()
            .then(function() {
                console.log('File deleted successfully...');
            }).catch(function() {
                console.log('Unable to delete...');
            });
        }
        return null;
    }
    //get file name
    const fileName = path.basename(filePath);
    console.log('filename: ' + fileName);

    //start stl generation
    const bucket = gcs.bucket(fileBucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    const metadata = {
        contentType: 'application/stl',
    };
    const targetTempFileName = fileName.replace(/\.[^/.]+$/, '') + '_output.stl';
    const targetTempFilePath = path.join(os.tmpdir(), targetTempFileName);
    const targetStorageFilePath = path.join(path.dirname(filePath), targetTempFileName);

    return bucket.file(filePath).download({
        destination: tempFilePath,
    }).then(() => {
        console.log('File downloaded locally to', tempFilePath);

        //generate a stl file using shp2stl module
        //here goes the conversion code
        var file = tempFilePath;
        var contents = fs.readFileSync(file);
        var json = JSON.parse(contents);
        shp2stl.geojson2stl(json, 
            {
                width: 100, //in STL arbitrary units, but typically 3D printers use mm
                height: 10,
                extraBaseHeight: 0,
                extrudeBy: "Floors",
                simplification: 0.8,
                
                binary: true,
                cutoutHoles: true,
                verbose: true,
                extrusionMode: 'smooth'
            },
            function(err, stl) {
                fs.writeFileSync(targetTempFilePath,  stl);
            }
        );
        //return spawn();
    }).then(() => {
        console.log('STL created at', targetTempFilePath);

        //uploading the stl file
        return bucket.upload(targetTempFilePath, {
            destination: targetStorageFilePath,
            metadata: metadata,
        });
        //Once the stl has been uploaded delete the local file to free up disk space
    }).then(() => {
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(targetTempFilePath);
    });
});
