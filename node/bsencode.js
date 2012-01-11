/*global Buffer, exports */

// Regular expressions to validate the integrity of symbols, integers, and
// nonnegative integers.
var symbol = /^(?:null|false|true|0|-?[1-9]\d*)$/,
    non_negative = /^(?:0|[1-9]\d*)$/,
    int = /^(?:0|-?[1-9]\d*)$/,
    iso_date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    re_flags = /^:g?i?m?$/;

exports.decode = function (buff) {
    "use strict";
    var current = 0,
        check = function (test, message) {
            if (!test) {
                throw new Error("bsencode error at char " + current + ": " +
                    message);
            }
        },
        current_is = function (min, max) {
            check(current < buff.length, "reached end of file while parsing.");
            var c = buff[current];
            return (max === undefined) ? c === min.charCodeAt(0) :
                    min.charCodeAt(0) <= c && c <= max.charCodeAt(0);
        };
    function unwrap() {
        var start, len, end, out;
        if (current_is("(")) { // list
            current += 1;
            out = [];
            out.positions = [];
            while (!current_is(')')) {
                current += current_is(' ') ? 1 : 0;
                out.positions.push(current);
                out.push(unwrap());
                check(current_is(' ') || current_is(')'),
                    "expected either ')' or ' '.");
            }
            current += 1;
            return out;
        } else if (current_is("'")) { // bytestring
            start = current += 1;
            while (current_is("0", "9")) {
                current += 1; // advance current to the ':' char.
            }
            len = non_negative.exec(buff.toString('ascii', start, current));
            end = (len !== null) ? JSON.parse(len[0]) + current + 1 : null;
            check(current_is(":") && end !== null && end <= buff.length,
                "invalid length specification.");
            start = current + 1;
            current = end;
            return buff.slice(start, end);
        } else if (current_is("*", "z")) { // symbol
            start = current;
            try {
                while (current_is("*", "z")) {
                    current += 1;
                }
            } catch (e) {} // ignore crashing into the end of the string.
            return buff.toString('ascii', start, current);
        } else {
            check(false, "expected symbol, \"(\", or \"'\".");
        }
    }
    function inflate(struct) {
        var out;
        if (struct instanceof Array) {
            switch (struct[0]) {
            case "bin":
                check(struct.length === 2 && Buffer.isBuffer(struct[1]),
                    "expected one byte string.");
                return struct[1];
            case "date":
                check(struct.length === 2 && typeof struct[1] === 'string' &&
                    iso_date.test(struct[1]), "expected a date symbol.");
                try {
                    return new Date(struct[1]);
                } catch (e) {
                    check(false, "expected a valid date specification.");
                    break; // jslint cannot see that check throws an exception.
                }
            case "dict":
                out = {};
                struct.slice(1).forEach(function (x, i) {
                    current = struct.positions[i + 1]; // for error tracing
                    check(x instanceof Array && x.length === 2,
                        "not a valid (key, val) pair.");
                    var key = inflate(x[0]), val = inflate(x[1]);
                    check(typeof key === "string" && !out.hasOwnProperty(key),
                        "invalid key.");
                    out[key] = val;
                });
                return out;
            case "float":
                check(struct.length === 2 && Buffer.isBuffer(struct[1]),
                    "expected one byte string.");
                return new Number(struct[1].readDoubleLE(0));
            case "regex":
                check(struct.length === 3 && Buffer.isBuffer(struct[1]) &&
                    typeof struct[2] === "string" && re_flags.test(struct[2]),
                    "expected a byte string and flags.");
                try {
                    return new RegExp(inflate(struct[1]), struct[2].substr(1));
                } catch (e) {
                    check(false, "expected a valid regex specification.");
                    break; // jslint cannot see that check throws an exception.
                }
            default:
                return struct.map(function (x, i) {
                    current = struct.positions[i + 1]; // for error tracing
                    return inflate(x);
                });
            }
        } else if (Buffer.isBuffer(struct)) {
            return struct.toString('utf8');
        } else if (typeof struct === "string" && symbol.test(struct)) {
            return JSON.parse(struct);
        } else {
            check(false, "unrecognized symbol.");
        }
    }
    return inflate(unwrap());
};
exports.encode = function (object) {
    "use strict";
    function deflate(o) {
        var k, keys, flags, buff, str;
        if (typeof o === "boolean") {
            return o.toString();
        } else if ((o instanceof Number || typeof o === "number") && 
                isFinite(o)) {
            buff = new Buffer(8);
            buff.writeDoubleLE(o, 0);
            str = JSON.stringify(o);
            return o instanceof Number || str.match(/[.e]/) ? 
                ["float", buff] : str;
        } else if (typeof o === "string" || o instanceof String) {
            return new Buffer(o, 'utf8');
        } else if (o instanceof Array) {
            return o.map(deflate);
        } else if (Buffer.isBuffer(o)) {
            return ["bin", o];
        } else if (o instanceof Date) {
            return ["date", o.toISOString()];
        } else if (o instanceof RegExp) {
            flags = ":" + (o.global ? 'g' : '') + (o.ignoreCase ? 'i' : '') +
                (o.multiline ? 'm' : '');
            return ["regex", deflate(o.source), flags];
        } else if (typeof o === "object" && o !== null) {
            keys = [];
            for (k in o) {
                if (o.hasOwnProperty(k) && o[k] !== undefined) {
                    keys.push(k);
                }
            }
            keys.sort();
            return ["dict"].concat(keys.map(function (key) {
                return [deflate(key), deflate(o[key])];
            }));
        } else {
            return "null";
        }
    }
    function wrap(deflated) {
        var out, header, start, len, sub_buffers;
        if (Buffer.isBuffer(deflated)) { // byte strings
            header = "'" + deflated.length + ":";
            out = new Buffer(header.length + deflated.length);
            out.write(header, 'ascii');
            deflated.copy(out, header.length);
        } else if (typeof deflated === "string") { // symbols
            out = new Buffer(deflated, 'ascii');
        } else if (deflated instanceof Array) { // lists
            if (deflated.length === 0) {
                return new Buffer('()', 'ascii');
            }
            sub_buffers = deflated.map(wrap);
            len = sub_buffers.reduce(function (sum, x) {
                return sum + x.length;
            }, 0);
            // output buffer holds () plus contents plus n-1 spaces.
            out = new Buffer(len + 1 + sub_buffers.length);
            out[0] = '('.charCodeAt(0);
            start = 1;
            sub_buffers.map(function (sbuf) {
                sbuf.copy(out, start);
                out[start + sbuf.length] = ' '.charCodeAt(0);
                start += sbuf.length + 1;
            });
            out[out.length - 1] = ')'.charCodeAt(0);
        }
        return out;
    }
    return wrap(deflate(object));
};