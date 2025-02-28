/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

'use strict';

module.exports = function (grunt) {
    require('./bin/run');

    const path = require('path');
    const Utils = require('./commons/Utils');
    const env = grunt.option('env') || 'production'; // Например, --env testing
    const upperDir = path.normalize(path.resolve('../') + '/');
    const targetDir = path.normalize(upperDir + 'appBuild/');
    const babelConfig = require('./babel/server.config');
    const hash = Utils.randomString(5);

    grunt.file.defaultEncoding = 'utf8';

    // Project configuration
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        mkdir: {
            target: {
                options: {
                    create: [targetDir],
                },
            },
        },
        clean: {
            options: {
                force: true, // This overrides grunt.file.delete from blocking deletion of folders outside cwd
            },
            target: {
                // Очищаем целевую директорию (кроме вложенной папки node_modules)
                src: [targetDir + '/*'/* , '!' + targetDir + '/node_modules' */],
            },
            publicTpl: {
                // Очищаем директорию скомпиленных tpl
                src: ['public/tpl'],
            },
            publicCss: {
                // Clean up compiled css.
                src: ['public/style/**/*.css'],
            },
        },
        exec: {
            buildjs: {
                command: 'node build.js',
                stdout: true,
                stderr: true,
            },
            npm: {
                command: 'npm --only=production install',
                cwd: targetDir,
                stdout: true,
                stderr: true,
            },
            movePublic: {
                command: `mv public-build ${targetDir}public`,
                stdout: true,
                stderr: true,
            },
            testNodeVersion: {
                command: filename => {
                    const error = `Version defined in ${filename} is not matching package version of node.`;
                    const pkgVersion = grunt.template.process('<%= pkg.engines.node %>');

                    return 'if [ "$(cat ' + filename + ')" != "' + pkgVersion + '" ]; then echo "' + error + '"; exit 1; fi;';
                },
                stdout: true,
                stderr: true,
            },
            testNodeVersionDockerfile: {
                command: filename => {
                    const error = `Version defined in ${filename} is not matching package version of node.`;
                    const pkgVersion = grunt.template.process('<%= pkg.engines.node %>');
                    const dockerParse = "sed -n -e '/^ARG NODE_TAG/ s/.*=//p' " + filename;

                    return 'if [ "$(' + dockerParse + ')" != "' + pkgVersion + '" ]; then echo "' + error + '"; exit 1; fi;';
                },
                stdout: true,
                stderr: true,
            },
            jest: {
                command: 'npm run jest -- --ci',
                stdout: true,
                stderr: true,
            },
        },
        'string-replace': {
            baseurl: {
                options: {
                    replacements: [
                        { pattern: /__=__/ig, replacement: `__=${hash}` },
                    ],
                },
                files: {
                    'public-build/js/_mainConfig.js': 'public-build/js/_mainConfig.js',
                },
            },
        },
        uglify: {
            options: {
                output: {
                    comments: false,
                },
            },
            publicApps: {
                options: {
                    banner: '/**\n' +
                    ' * Hello, inquiring mind!\n' +
                    ' * This is <%= pkg.name %> application of <%= pkg.description %>.\n' +
                    ' * Explore its source code and contribute at <%= pkg.homepage %>\n' +
                    ' * Version: <%= pkg.version %>, built <%= grunt.template.today("dd.mm.yyyy") %>\n' +
                    ' * Author: <%= pkg.author.name %> <<%=pkg.author.email%>>\n' +
                    ' */\n',
                },
                files: {
                    'public-build/js/module/appMain.js': [
                        'public-build/js/lib/require/require.js',
                        'public-build/js/_mainConfig.js',
                        'public-build/js/module/appMain.js',
                    ],
                    'public-build/js/module/appAdmin.js': [
                        'public-build/js/lib/require/require.js',
                        'public-build/js/_mainConfig.js',
                        'public-build/js/module/appAdmin.js',
                    ],
                },
            },
            publicJs: {
                files: [{
                    expand: true,
                    src: ['**/*.js', '!**/*.min.js', '!module/appMain.js', '!module/appAdmin.js'],
                    dest: 'public-build/js',
                    cwd: 'public-build/js',
                }],
            },
        },
        copy: {
            main: {
                files: [
                    {
                        expand: true,
                        src: [
                            'app/**', 'bin/**', 'migrations/**', 'commons/**', 'misc/watermark/**',
                            'controllers/systemjs.js', 'npm-shrinkwrap.json',
                            'config/@(client|server|log4js|migrate-mongo|browsers.config|default.config).js', 'config/package.json',
                        ],
                        dest: targetDir,
                    },
                    {
                        expand: true,
                        src: ['views/app.pug', 'views/api/**', 'views/includes/**', 'views/mail/**', 'views/status/**', 'views/diff/**'],
                        dest: targetDir,
                    },
                    // {expand: true, cwd: 'public-build', src: ['**'], dest: targetDir + 'public'},
                    {
                        expand: true,
                        src: ['api.js', 'package.json', './README'],
                        dest: targetDir,
                    },
                ],
            },
        },
        pug: {
            compileTpls: {
                options: {
                    data: {
                        config: { env, hash }, pretty: false,
                    },
                },
                files: [
                    { expand: true, cwd: 'views/module/', src: '**/*.pug', dest: 'public/tpl/' },
                ],
            },
            compileMainPugs: {
                options: {
                    data(dest/* , src */) {
                        const name = dest.replace(/.*\/(?:app)?(.*)\.html/i, '$1');

                        grunt.log.write('appName: ' + name + '. ');

                        return { appName: name, config: { env, hash }, pretty: false };
                    },
                },
                files: [
                    {
                        expand: true,
                        cwd: targetDir + 'views/',
                        ext: '.html',
                        src: 'status/404.pug',
                        dest: targetDir + 'views/html/',
                    },
                ],
            },
        },
        babel: {
            options: { ...babelConfig },
            dist: {
                files: [
                    {
                        expand: true,
                        src: [ // May be array of regexp, or github.com/isaacs/node-glob
                            '@(app|downloader|uploader|sitemap|notifier|worker).js',
                            'controllers/!(systemjs|api|apilog).js',
                            'commons/Utils.js',
                            'models/*.js',
                            'app/*.js',
                            'app/webapi/*.js',
                            'app/errors/*.js',
                        ],
                        dest: targetDir,
                    },
                ],
            },
        },
        compress: {
            main: {
                options: {
                    archive: upperDir + 'app<%= pkg.version %>.zip',
                    mode: 'zip',
                    level: 9,
                    forceUTC: true,
                    comment: 'This PastVu application builded and compressed with Grunt',
                },
                files: [
                    { expand: true, cwd: targetDir, src: ['**/*'/* , '!node_modules*' */], dest: 'app' },
                ],
            },
        },
        eslint: {
            options: {
                configFile: '.eslintrc.js',
                fix: grunt.option('fix'),
            },
            all: {
                files: {
                    src: [
                        '.*.js',
                        '*.js',
                        'app/**/*.js',
                        'babel/*.js',
                        'controllers/**/*.js',
                        'commons/**/*.js',
                        'models/**/*.js',
                        'config/!(local.config).js',
                        'config/*example',
                        'migrations/*.js',
                        'tests/*.js',
                        'public/js/**/*.js',
                        '!public/js/shape2geojson/*.js',
                        // public/js/lib lib contains third-party libs, with some
                        // exceptions listed below.
                        '!public/js/lib/**',
                        'public/js/lib/leaflet/extends/*.js',
                        'public/js/lib/Browser.js',
                        'public/js/lib/JSExtensions.js',
                        'public/js/lib/Utils.js',
                        'public/js/lib/knockout/extends.js',
                    ],
                },
            },
        },
        stylelint: {
            options: {
                configFile: '.stylelintrc.js',
                fix: grunt.option('fix'),
            },
            all: [
                'public/style/**/*.less',
            ],
        },
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-pug');
    grunt.loadNpmTasks('grunt-contrib-compress');
    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-string-replace');
    grunt.loadNpmTasks('grunt-exec');
    grunt.loadNpmTasks('grunt-mkdir');
    grunt.loadNpmTasks('grunt-babel');
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-stylelint');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    // Build.
    grunt.registerTask('default', [
        'mkdir:target',
        'clean:target',
        'pug:compileTpls',
        'exec:buildjs',
        'uglify:publicApps',
        'uglify:publicJs',
        'string-replace',
        'copy:main',
        'babel',
        'exec:movePublic',
        'pug:compileMainPugs',
        'clean:publicTpl',
        'writeBuildParams',
        //'exec:npm',
        'compress',
    ]);

    // Tests.
    grunt.registerTask('test', [
        'exec:testNodeVersion:.node-version',
        'exec:testNodeVersion:.nvmrc',
        'exec:testNodeVersionDockerfile:./.docker/Dockerfile',
        'exec:testNodeVersionDockerfile:./.docker/backend.Dockerfile',
        'exec:testNodeVersionDockerfile:./.docker/frontend.Dockerfile',
        'eslint',
        'stylelint',
        'exec:jest',
    ]);

    // Записываем параметры сборки, например hash, из которых запуск в prod возьмет данные
    grunt.registerTask('writeBuildParams', () => {
        const buildString = JSON.stringify({ hash });

        grunt.file.write(targetDir + 'build.json', buildString);
        grunt.log.writeln('Build json: ' + buildString);
        grunt.log.write('env: ' + env + '. ');
    });
};
