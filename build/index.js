// Main module
module.exports = function webpackConfig( dirName, done ) {

  // Run with NodeJS in order to see the command documentation
  var argv = require('optimist')
    .usage('Usage: $0 -- od [str] --pp [str] [--w [bool] --sm [bool] --fp [str] --cwd [str] --dt [str]]')
    .default({
      pp    : '/assets/'
      ,fp   : './files'
      ,w    : false
      ,kl   : false
      ,sm   : false
      ,cwd  : process.cwd()
      ,dt   : 'inline-source-map'
      ,env  : 'dev'
      ,dd   : false
      ,pf   : null
    })
    .alias('od','out-dir').describe('od', 'The directory were the bundles should be saved at')
    .alias('pp','public-path').describe('pp', 'The pulbic path for the bundled files')
    .alias('fp','files-path').describe('fp', 'Relative path from --od to export files referenced in src')
    .alias('kl','keep-log').boolean('kl').describe('kl', 'Weather to keep the logs or remove them')
    .alias('w','watch').boolean('w').describe('w', 'Watch files that change. Only watches compiled files')
    .alias('sm','sourcemap').boolean('sm').describe('sm', 'Force sourcemap to be enabled and use --dt')
    .alias('dt','devtool').describe('dt', 'Choose a developer tool. File size increases')
    .alias('dd','dedupe').boolean('dd').describe('dd', 'Dedupe files in order to descrize file size')
    .alias('env','environment').describe('env', 'Choose environment. dev, qa or prod')
    .alias('pf','profile').describe('pf', 'Enable the profiling during compilation. --pf someName')
    .demand(['od'])
    .argv
  ;

  var
    run                = !argv.w
    ,outDir            = argv.od
    ,publicPath        = argv.pp
    ,fileDir           = argv.fp 
    ,devtool           = argv.dt
    ,allowSM           = argv.sm
    ,env               = argv.env
    ,dedupe            = argv.dd
    ,profile           = argv.pf
    ,stripLog          = argv.kl || (argv.env!=='prod'&&!argv.kl) ? '' : '!strip-loader?strip[]=debug,strip[]=console.log'
    ,webpack           = require('webpack')
    // ,ngAnnotate     = require('ng-annotate-webpack-plugin')
    ,ExtractTextPlugin = require('extract-text-webpack-plugin')
    ,fs                = require('fs')
    ,path              = require('path')
    ,includeDir        = fs.readdirSync(argv.cwd).filter(function(it){return !it.match(/node_modules|web_modules/)}).map(function(it){return 'websdk.'+it})
    ,config            = {
      // context: argv.c,
      entry: {
        start : dirName + '/../app_modules/index.js' // Starting point
      }
      ,lib     : {} // The concept of libraries is part of the websdk
      ,profile : profile ? true : false
      ,cache   : true
      ,output  : {
        path           : outDir
        ,filename      : "[name].bundle.js"
        ,chunkFilename : "[name].chunk.js"
        ,publicPath    : publicPath
      }
      ,resolve: {
        modulesDirectories: ["app_modules", "node_modules", "web_modules"] // Only main files
      }
      ,plugins : []
      ,module  : {
        loaders: [
          // Javascript excluding node_modules and web_modules except for this library
           { test: /\.js$/, loader: "babel?optional[]=runtime"+stripLog, exclude: /(node_modules|web_modules)/ }
          ,{ test: /\.js$/, loader: "babel?optional[]=runtime"+stripLog, include: new RegExp(includeDir.join('|')) }
          ,{ test: /\.less$/, loader: "style!css!less" }
          ,{ test: /\.less.vendor$/, loader: env!=='dev' ? ExtractTextPlugin.extract('style', 'css!less') : "style!css!less" }
          ,{ test: /\.yaml$/, loader: "json!yaml" }
          ,{ test: /\.html$/, loader: "html" }

          // Fonts
          ,{ test: /\.(ttf|eot|svg)(\?v=[0-9]\.[0-9]\.[0-9])?$/, loader: 'file-loader?name='+fileDir+"/[hash].[ext]"}
          ,{ test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/, loader: 'url-loader?name='+fileDir+'/[hash].[ext]&lmit=10000&mimetype=application/font-woff'}

          // Images
          ,{ test: /\.png/, loader: 'url?name='+fileDir+'/[hash].[ext]&limit=10000&mimetype=image/png' }
          ,{ test: /\.svg/, loader: 'url?name='+fileDir+'/[hash].[ext]&limit=10000&mimetype=image/svg+xml' }
        
          // special loader for vendor modules
          // jQuery has an AMD bug, and needs to be patched for now
          ,{ test: path.resolve(require.resolve('jquery'),'../../src/selector.js'), loader: 'amd-define-factory-patcher-loader'}
        ]
      }
    }
  ;

  // Clear the output directory
  rmDir(argv.od);

  // Add more settings to the configuration
  var allowDevtool = (!!devtool) && env!=='prod';
  if(allowDevtool||allowSM) config.devtool = devtool;

  // Create vendor entries
  // TODO: This approach copies the entire vendor library even if not used, find a better solution
  config.entry.common = __dirname + '/runtime.vendor.js'; // Common modules between entry files will go here (should be the first file to be loaded)
  config.plugins.push(
    new webpack.optimize.CommonsChunkPlugin( /*bundlename*/ 'common', /*filename*/ 'common.bundle.js' )
    ,new ExtractTextPlugin('[name].css')
  )
  // Remove the logging module from source
  // if(stripLog){
  //   config.plugin.push(new webpack.NormalModuleReplacementPlugin(/websdk\/essential\/log/, __dirname + '/noop.js'));
  // }

  // If running for qa or prod
  if(env!=='dev') {

    config.plugins.push(
      // new ngAnnotate({
      //   add        : true
      //   ,sourcemap : allowDevtool
      // })
      new webpack.optimize.UglifyJsPlugin({
        compress: {
          warnings: false
        }
        ,mangle: {
          // except: ['angular']
        }
      })
    );
    // If prod or dedupe enabled then we will run the deduping feature
    // if (dedupe||env=='prod') config.plugins.unshift(new webpack.optimize.DedupePlugin());
  }

  function handleCompile(err, stats){
    if(err)
      throw err;
    var jsonStats = stats.toJson();
    if(jsonStats.errors.length > 0)
      throw jsonStats.errors.join();
    if(jsonStats.warnings.length > 0)
      throw jsonStats.warnings.join();

    console.log(stats.toString({colors:true}));
    console.log('=========================');
    console.log('Webpack completed build');
    console.log('Output dir was set to ', outDir);
    // TODO: Review why stripLog is making files non-cacheable during build
    if(stripLog) console.log('WARNING: You should use the flag --kl in order to keep the logs and allow files to be cacheable');
    if(!run){
      console.log('Webpack has locked this process. Watching file that were part of the build.');
    }

    if(profile){
      var filePath = path.resolve(dirName,'..',profile,'.stats.json')
      console.log('Saving profile to: '+filePath);
      console.log('Visualize profile using (it will not be actually uploaded): http://webpack.github.io/analyse');
      fs.writeFileSync( filePath, JSON.stringify(jsonStats) );
    }

    // If a done method is configured, then execute it
    done && done(err,stats);
  }

  return {
    argv    : argv
    ,config : config
    ,run    : function(){
      // Create the chunk splits
      createChunkSplits(config, dirName);

      // Notify about the action
      console.log('Building from scratch, this might take some time');
      console.log('====================================')

      // Create the compiler
      var compiler = webpack(config);

      if(run){
        compiler.run(handleCompile)
      } else {
        compiler.watch({
          aggregateTimeout: 300 // Wait so long for more changes
          // ,poll: true // Use polling instead of native watchers
          // pass a number to set the polling interval
        },handleCompile);
      }
    }
  }

  // ================================================

  // Load all vendor libraries into a single module
  // var vendors = [];
  // try{ vendors.push.apply(vendors, Object.keys(require(path.resolve(process.cwd(),'package.json')).dependencies)) }
  // catch(e) { console.error('Issue finding a package.json at ' + process.cwd(), e); }
  // try{ vendors.push.apply(vendors, Object.keys(require(path.resolve(process.cwd(),'bower.json')).dependencies)) }
  // catch(e) { console.error('Issue finding a bower.json at ' + process.cwd(), e); }

  // try{ vendors.push.apply(vendors, fs.readdirSync(path.resolve(process.cwd(),'./node_modules'))) }
  // catch(e) { console.error('Issue finding node_modules at ' + process.cwd(), e); }
  // try{ vendors.push.apply(vendors, fs.readdirSync(path.resolve(process.cwd(),'./web_modules'))) }
  // catch(e) { console.error('Issue finding web_modules at ' + process.cwd(), e); }

  // config.entry.vendor = vendors;

}


// ==========================================

// Get a reference to the file system library
var
  fs    = require('fs')
  ,path = require('path')
;

// Utility function to remove directories
function rmDir(dirPath){
  console.log('Attempting to clean: ' + dirPath);
  try { var files = fs.readdirSync(dirPath); }
  catch(e) { return; } // No files to clean
  if(files.length > 0)
    for (var i = 0; i < files.length; i++){
      var filePath = dirPath + '/' + files[i];
      if (fs.statSync(filePath).isFile())
        fs.unlinkSync(filePath);
      else
        rmDir(filePath);
    }
  try { fs.rmdirSync(dirPath); }
  catch(e) { return; }
}

// Utility function to scan directories
function scanDir(dir, done) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var i = 0;
    (function next() {
      var file = list[i++];
      if (!file) return done(null, results);
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          scanDir(file, function(err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push(file);
          next();
        }
      });
    })();
  });
};

// Automatically find directories that are intended to become libraries
function createChunkSplits(config, dirName){

  // Only if there are libs to process
  if(!config.lib) return;

  // Notify about it
  console.log('Creating library splits');

  // Create a common loader
  var loader = function(config, cb){
    // This will tell webpack to create a new chunk
    rq.ensure(['INDEX_PATH'],function(rq){
      cb(
        // Execute the libarary init (the libraries index should export its lib.init)
        // Config will be the configuration with which this module was created with
        rq('INDEX_PATH')(config)
      );
    },'NAME')
  }

  // For each lib in the config or for each app_module
  var
    loaders = []
    fileOut = dirName + '/libraries.websdk.js'
    names   = Object.keys(config.lib)
  ;
  if( !names.length ) return;
  names.forEach(function(it){
    var libPath = path.resolve(config.lib[it]).replace(/\\/g,'/');

    // Add the definition for this loader
    loaders.push(
      'Registry["' + it + '"] = ' + loader.toString()
        .replace(/INDEX_PATH/g, libPath)
        .replace(/NAME/g, it)
        .replace(/rq/g,'require')
    );
  });

  // Create the libraries file, this file can be committed if desired
  fs.writeFileSync( fileOut,
    "import Registry from 'websdk/essential/module/registry';\n"
    + loaders.join("\n")
  );
}
