#!/usr/bin/env node
'use strict';
var fs = require('fs');
var mustache = require('mustache');
var onecolor = require('onecolor');
var path = require('path');
var phantomjs = require('phantomjs');
var phantom = require('phantom');
var program = {};
var appInfo = require('../package.json');
// instance variables
var output = {};
var outputNames = {
	resource:      '      Resource',
	uri:           '           URI',
	success:       '       Success',
	dominantColor: 'Dominant Color',
	palette:       '       Palette',
	image:         '         Image'
};
var outputTypes = ['text', 'json', 'html'];

module.exports = {
  run: function(uri, numColors) {
    output.resource = uri
    output.uri = uri
    program.size = numColors
    program.quality = numColors
    program.output = 'json'

    var toHexColor = function (rgbArray) {
      var parsedColor = onecolor('rgb(' + (rgbArray || []).join(',') + ')');
      return parsedColor && parsedColor.isColor ? parsedColor.hex() : '';
    };

    return new Promise(function(resolve) {
      phantom.create('--web-security=false', '--ignore-ssl-errors=true', '--ssl-protocol=TLSv1', {
        path: path.dirname(phantomjs.path) + path.sep,
        onStdout: function () {},
        onStderr: function () {},
        onExit: function () {}
      }, function (ph) {
        ph.createPage(function (page) {
          page.set('viewportSize', {width: 1024, height: 1024}, function () {
            page.open(output.uri, function (success) {
              output.success = success === 'success';
              page.renderBase64('png', function (imageBase64) {
                var html;
                // setup image data uri
                imageBase64 = 'data:image/png;base64,' + imageBase64;
                // cheap hack
                html = [
                  '<meta charset="utf-8" />',
                  '<img id="img" src="' + imageBase64 + '" />',
                  '<div id="size">' + program.size + '</div>',
                  '<div id="quality">' + program.quality + '</div>',
                ].join('');
                page.setContent(html, output.uri, function () {
                  page.injectJs(__dirname + path.sep + 'color-thief.js', function () {
                    page.injectJs(__dirname + path.sep + 'inject-script.js', function () {
                      page.evaluate(function (h) {
                        return {
                          dominantColor: window.dominantColor,
                          palette: window.palette,
                          croppedImage: window.croppedImage,
                          uri: document.location.href
                        };
                      }, function (result) {
                        ph.exit();
                        output.dominantColor = toHexColor(result.dominantColor);
                        output.palette = (result.palette || []).map(function (rgbArray) {
                          return toHexColor(rgbArray);
                        });
                        output.uri = result.uri;
                        if (program.image || program.output === 'html') {
                          output.image = result.croppedImage;
                        }
                        if (program.output === 'json') {
                          console.log(JSON.stringify(output, null, '  '));
                        } else if (program.output === 'html') {
                          output.json = JSON.stringify(output, null, '  ');
                          output.paletteLength = output.palette.length || 0;
                          output.palettePercentage =  100 / (output.palette.length || 1) + '%';
                          console.log(mustache.render(fs.readFileSync(__dirname + '/../views/index.html', 'utf-8'), output));
                        } else {
                          Object.keys(outputNames).forEach(function (key) {
                            if (output.hasOwnProperty(key)) {
                              console.log(outputNames[key] + ': ' + output[key]);
                            }
                          });
                        }
                        //process.exit();
                        resolve(output)
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }
}
