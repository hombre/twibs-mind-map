#!/usr/bin/env bash

RL=`readlink -f $0`
DIR=`dirname ${RL}`
DEFAULT_CLOSURE_COMPILER=~/Programme/closure-compiler-v20190513.jar
CLOSURE_COMPILER=${1:-$DEFAULT_CLOSURE_COMPILER}

tsc -p ${DIR}/src
tsc -p ${DIR}/test

java -jar ${CLOSURE_COMPILER} --language_out ECMASCRIPT_2017 --compilation_level SIMPLE_OPTIMIZATIONS --js_output_file ${DIR}/dist/twibs-mind-map.min.js ${DIR}/dist/twibs-mind-map.js
java -jar ${CLOSURE_COMPILER} --language_out ECMASCRIPT_2017 --compilation_level SIMPLE_OPTIMIZATIONS --js_output_file ${DIR}/test/test.min.js ${DIR}/test/test.js
#java -jar ${CLOSURE_COMPILER} --language_out ECMASCRIPT6 --compilation_level SIMPLE_OPTIMIZATIONS --js_output_file ${DIR}/test/test.es6.min.js ${DIR}/test/test.js

scss -q --no-cache --update test/test.scss:test/test.css
scss -q --no-cache --update test/test.scss:test/test.min.css --style compressed --sourcemap=none
