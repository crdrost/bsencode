/*global require, Buffer */
/*jslint bitwise: true */
var crypto = require("crypto"),
    bs = require("./bsencode.js");

/* adso implementation for Node.js.
 *
 * Node recommends not to use 'binary' strings but the node crypto module uses
 * them quite extensively. Wherever binary strings are stored or expected as
 * variable arguments, we use Hungarian notation, prefixing the variable name
 * with `bin_`. Also any function which returns them is prefixed with `bin_`.
 */

/*
(dict ('3:app '12:adso-keyring) ('5:descr '115:

This is a password storage application for adso. See the adso docs at:
    http://github.com/drostie/adso/

) ('4:hmac '2:2lujwSh/etE3iu2z2H39) ('(date 2012-01-10 02:47:58.000)) ('4:salt '9:9KzD5RCzRF9S) ('6:z-data (bin 'xxxx:()))
*/
function encrypt(method, key, nonce, data) {
    "use strict";
    var bin_cipher = crypto.createCipheriv(
        method,
        key.toString('binary'),
        nonce.toString('binary')
    );
    return new Buffer(bin_cipher.update(data) + bin_cipher.final(), 'binary');
}
function decrypt(method, key, nonce, data) {
    "use strict";
    var bin_cipher = crypto.createDecipheriv(
        method,
        key.toString('binary'),
        nonce.toString('binary')
    );
    return new Buffer(bin_cipher.update(data) + bin_cipher.final(), 'binary');
}
function bin_hmac_sha512(bin_key, bin_message) {
    "use strict";
    var hmac = crypto.createHmac('sha512', bin_key);
    hmac.update(bin_message);
    return hmac.digest();
}
function hmac_sha512(key, message) {
    "use strict";
    return new Buffer(
        bin_hmac_sha512(key.toString('binary'), message.toString('binary')),
        'binary'
    );
}
function bin_from_int(i) {
    "use strict";
    var out = new Buffer(4);
    out.writeUInt32BE(i);   // RFC2898 uses a big-endian int.
    return out.toString('binary');
}
/* Derive a key `Buffer` of size `out_length` with `PBKDF2(HMAC(SHA512))`. */
function key_deriv(password, salt, rounds, out_length) {
    "use strict";
    var b, r, i, o = 0, // counters: block, round, xored byte, output location.
        hLen = 512 / 8, // hash length in bytes.
        blocks,         // number of hLen blocks to be created.
        remainder,      // number of bytes in the last block.
        bin_chain,      // the chaining value, left as a binary string.
        current = new Buffer(hLen),
        output = new Buffer(out_length),
        bin_pass = new Buffer(password, 'utf8').toString('binary'),
        bin_salt = new Buffer(salt, 'base64').toString('binary');

    if (out_length > hLen * (Math.pow(2, 32) - 1)) {
        // this comes straight from RFC 2838.
        throw "derived key too long";
    }
    blocks = Math.ceil(out_length / hLen);
    remainder = out_length - hLen * (blocks - 1);
    for (b = 1; b <= blocks; b += 1) {
        // Generate current = F(password, salt, rounds, b) [RFC 2898's 'F'.]
        current.fill(0);
        bin_chain = bin_salt + bin_from_int(b);
        for (r = 0; r < rounds; r += 1) {
            bin_chain = bin_hmac_sha512(bin_pass, bin_chain);
            for (i = 0; i < current.length; i += 1) {
                current[i] ^= bin_chain.charCodeAt(i);
            }
        }
        // then copy it into output and advance the output-start counter.
        current.copy(output, o, 0, b === blocks ? remainder : hLen);
        o += hLen;
    }
    return output;
}
function random_bytes(m, n) {
    "use strict";
    n = n || m;
    return new Buffer(
        crypto.randomBytes(m + Math.floor(Math.random() * (n - m))),
        'binary'
    );
}
function equal_bytes(a, b) {
    "use strict";
    var i;
    if (a.length !== b.length) {
        return false;
    }
    for (i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
function adso_encoder(app, description) {
    "use strict";
    return {
        'encode': function (data, password, method) {
            var nonce = random_bytes(16),
                salt = random_bytes(8),
                key = key_deriv(password, salt),
                blank_line = "\r\n\r\n",
                validated;
            method = method || "AES-256-CBC";
            validated = bs.encode([
                "encrypted\r\n",
                {
                    "last modified": new Date(),
                    "method": method,
                    "nonce": nonce.toString('base64') + blank_line
                },
                encrypt(method, key, nonce, bs.encode({
                    "data": data,
                    "pad" : random_bytes(0, 1024)
                }))
            ]);
            return bs.encode([
                "adso",
                {
                    "app": app.replace(/\r?\n/g, "\r\n"),
                    "descr": blank_line + description.replace(/\r?\n/g, "\r\n") + blank_line,
                    "hmac": hmac_sha512(key, validated).toString('base64'),
                    "salt": salt.toString('base64')
                },
                validated
            ]);
        },
        'decode': function (raw_data, password) {
            var data = bs.decode(raw_data),
                key = key_deriv(password, data[1].salt),
                hmac = hmac_sha512(key, data[2]).toString('base64'),
                crypt,
                method,
                nonce;
            if (hmac !== data[1].hmac) {
                throw new Error("That password does not decrypt this adso object.");
            } else {
                crypt = bs.decode(data[2]);
                method = new Buffer(crypt[1].method, 'base64');
                nonce = new Buffer(crypt[1].nonce, 'base64');
                return bs.decode(decrypt(method, key, nonce, crypt[2])).data;
            }
        }
    };
}
/*
var keyring = adso_encoder("adso-keyring", "Encrypted password and key storage. More info at: \n    https://github.com/drostie/adso/");

var encoded = keyring.encode({"life": ["like", "a", "box", "of", "chocolates"]});
console.log(encoded.toString('utf8'));
console.log(keyring.decode(encoded));
*/