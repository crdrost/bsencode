# bsencode

bsencode is a binary-friendly encoder I developed for node.js, and I intend to
make it work with Python as well.

Basically my goal was to write a grammar that was absurdly easy to *parse*,
since it's usually easier to dump information than to read it back again. In
doing so, I accidentally found myself writing a *bootstrapped encoding*: a very
simple low-level syntax could be quickly parsed, but wasn't expressive enough,
so I built a more expressive language on top of it.

My goal was mostly to make [bencoding][bencode] a little more legible, so my
code has some bencode idiosyncrasies -- it defines an integer type which
appears as text digits, for example. However, it is also in many ways inspired
by [s-expressions](http://people.csail.mit.edu/rivest/Sexp.txt) and also
[BSON](http://bsonspec.org/).

[bencode]: http://wiki.theory.org/BitTorrentSpecification#Bencoding

# What's the API?

Very simple. Encoding:

    > var bs = require("bsencode"), buf;
    > buf = bs.encode({"abc": [123, 456], "def": "ghi"});
    <Buffer 28 64 69 63 74 20 28 27 33 3a 61 62 63 20 28 31 32 33 20 34 35 36
     29 29 20 28 27 33 3a 64 65 66 20 27 33 3a 67 68 69 29 29>
    > console.log(buf.toString());
    (dict ('3:abc (123 456)) ('3:def '3:ghi))
    undefined

Decoding:

    > bs.decode(new Buffer("(regex '28:\\b#[0-9a-f]{3}|[0-9a-f]{6}\\b :i)"))
    /\b#[0-9a-f]{3}|[0-9a-f]{6}\b/i
    > buf = new Buffer("28666c6f61742027383a182d4454fb21094029", "hex");
    <Buffer 28 66 6c 6f 61 74 20 27 38 3a 18 2d 44 54 fb 21 09 40 29>
    > console.log(buf.toString()); bs.decode(buf);
    (float '8:▒-DT�!        @)
    3.141592653589793

As you can see it is not precisely a text-based format; bsencode can include
arbitrary binary data and can thereby precisely represent double-precision
floating-point numbers. This fits my original purpose, which was to be able to
store cryptographic data efficiently with a human-readable header.

# How does it compare?

Here is the same simple structure in several languages for comparison:

    JSON
      {"a": {"one": 1, "two": 2, "three": 3}, "b": ["one", "two", "three"]}
    bencode
      d1:ad3:onei1e5:threei3e3:twoi2ee1:bl3:one3:two5:threeeee
    BSON **
      U___#a_"___~three_#___~two_@___~one_!____$b_(___@0_$___one_@1_$___two_@2_^___three___
    bsencode
      (dict ('1:a (dict ('3:one 1) ('5:three 3) ('3:two 2))) ('1:b ('3:one '3:two '5:three)))

    ** Most of the BSON bytes are not printable; this text file prints them by
       using the following mapping:
        {0: '_', 1: '!', 2: '@', 3: '#', 4: '$', 6: '^', 16: '~'}

As far as code footprint goes, the BSON and JSON parsers that I could find took
around 300 lines to parse and 300 lines to serialize, usually without very
specific error reporting. (BSON parsers in particular seem to be spread over
several files.) On the other hand, bencode is closer to 50 lines to parse and
50 lines to serialize. While bsencode has the expressiveness of BSON it takes
only 69 lines to serialize and 107 to parse, including rather full reporting
for parse errors (without error reporting it gets down to around 67 lines to
parse).

# The rules of bsencode

bsencode stands for *bootstrapped encode*, meaning that there is a language
built on top of another language. To make the rest of this document precise,
the lower-level language is called the *syntax* and the higher-level language
is called the *semantics*. Using the syntax to parse a byte string to an
intermediate format is called *unwrapping* and using the semantics to parse the
intermediate format to the language's format is called *inflating* --
the inverses of these being *wrapping* and *deflating* respectively.

## Syntax Rules

A bsencoded document is an octet string which may in many cases be human-
readable with the UTF8 encoding, thus when I mention specific characters below,
I really mean their UTF8/ASCII character codes. There are three syntax
primitives:

 *  **Lists** are enclosed in parens and separated by spaces.
 *  **Byte strings** start with a single quote, followed by some digits which
    describe a number *N*, followed by a colon, followed by *N* digits. Byte
    strings are like netstrings prefixed by a quote and without a trailing
    comma.
 *  **Symbols** contain one or more bytes from 42 - 122 inclusive -- in other
    words, all visible ASCII except for ` !"#$%&'(){|}`.

So for example, the ASCII string `(1 2 34 '5:abcde)` is a valid bsencoded
string; it syntactically contains one list, which contains three symbols
followed by one byte string of four bytes.

In the Node.js implementation, symbols are unwrapped into strings, byte strings
are unwrapped into Buffers, and lists are unwrapped into Arrays. Notice that
symbols do not admit of empty strings, for convenience in parsing.

Extra whitespace is NOT allowed in the core language. It could be allowed in a
derivative language.

## Semantic rules

The semantic rules are a little trickier to state precisely. The best way is
to refer to "a `<K>` object holding `<children>`" as a list whose first element
is the symbol `<K>` and whose following elements are the specified
`<children>`. Lists of children are always exhaustive and strictly ordered.

bsencode defines the following semantic types:

 *  the null object, deflated as the symbol `null`
 *  boolean false, as the symbol `false`
 *  boolean true, as the symbol `true`
 *  integers, as symbols in ASCII decimal notation.
 *  Unicode strings, deflated into byte strings by encoding in UTF-8.
 *  arrays, as lists holding the deflated contents of the array in order.
 *  byte arrays, as a `bin` object holding that byte array as a byte string.
 *  dicts, as a `dict` object holding, for each (key, value) pair in the dict,
    a list containing the key and the deflated value in that order.
 *  dates, as a `date` object holding a symbol containing a subset of RFC 3339
    date strings.
 *  double-precision floating-point numbers, as a `double` object holding the
    little-endian IEEE 754 binary64 representation as a byte string.
 *  regular expressions, as a `regex` object holding the deflated expression
    string and a flags symbol. The flags symbol starts with a `:` and may
    optionally contain the global flag `g`, the case-insensitive flag `i`, and
    the multi-line-mode flag `m`, in that order.

These last three are mostly illustrations of the ease with which bsencode can
be extended; I didn't need them but I have provided the core language with all
three just to show how bsencode implements new types very easily.

### Deeper into the details

There are some details not quite covered in that list.

 *  bsencode dates are a subset of RFC 3339: the time zone field must be the
    uppercase character "Z"; the character "T" must also be uppercase; the
    fractional part of the seconds is not optional and must contain three
    decimal digits. In other words, they match the regular expression
    `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`. RFC 3339 imposes other
    restrictions on the numbers involved, so that they represent valid dates,
    but as a rule bsencode *does not check this* by itself.
 *  `-0` is not a valid integer symbol.
 *  dict keys must be strings, and are represented as byte strings.
 *  When deflating a dictionary, the keys should be sorted so that they appear
    in lexicographic order.
 *  Implementations may arbitrarily decide how to map these types to their
    native types, but should not map these types in a many-to-one way -- in
    other words, `bs.encode(bs.decode(x))` should return an identical byte
    string to `x` if `x` has valid syntax.

(This last case is established in my Javascript implementation by always
inflating a `float` object as a JS `Number` object, and always deflating a JS
`Number` object as a `float` object.)

Many of these choices were motivated by the uniqueness guarantee of bencode: an
identical object serialized by two different implementations should generate
two strings which are bytewise-identical and have, for example, identical
hashes. This is why whitespace is not optional in the core language, and why
floats are encoded as bytes as opposed to JSON strings. The requirement that a
dictionary be sorted is similar: not all languages have ordered dictionary
types, so I have endeavored to make `bs.encode(bs.decode(x))` the same as `x`
for all valid octet strings x even in languages which don't have ordered dicts.

## Derivative grammars

bsencode is extremely simple and therefore easy to extend. Extensions may, for
example, add or remove semantic objects, or add semantics for symbols which
aren't integers, or remove support for current objects, or modify the syntax.
Lots of possibilities are open.

I thought I'd just include some fun ideas about projects that I think could be
reasonably implemented as bsencode derivatives.

 *  JSON numbers could be added as valid symbols, or JSON strings could be
    added as a new syntactic primitive.
 *  Metadata in the form `(meta <bstr> <expr>)` could allow people to comment
    bsencoded expressions -- or else syntactic comments could perhaps start
    with the character `#` and continue to the end of the line.
 *  A derivative grammar could allow arbitrary whitespace in lists.
 *  Rational numbers as either `(frac <int> <int>)` or the symbol `<int>/<int>`
    would be nifty. Complex numbers could be allowed using the Python
    `repr()` format of including a j, or else as `(complex <bstr> <bstr>)`.
 *  curly braces could have some sort of syntactic meaning in a derivative
    version.
 *  Semantics could be added for any symbol beginning with a `:` so that you
    could store a limited range of Ruby-like symbol types. It lacks the full
    range of Ruby expressiveness since bsencode symbols cannot contain spaces.
    Alternatively, `(sym <bstr>)` could be used for the arbitrary case.
 *  MIME types are valid symbols, so it might be nice to be able to encode an
    arbitrary file this way -- an `image/png` object would contain the binary
    data of a PNG file, for example.
 *  Languages like Python have ordered dictionary types; the semantics of
    `dict` objects could be changed to respect ordered dictionaries.

The grammar described above is the "bsencode" or "bsencode-core" grammar;
derivative versions should call themselves something else, although the word
"bsencode" or the initials "bs" could appear in their names too if the language
designers wish.

# License

This project was authored by Chris Drost of drostie.org. To the extent
possible by all laws in all countries, I hereby waive all copyright and any
related rights under the Creative Commons Zero (CC0) waiver/license, which
you may read online at:

    http://creativecommons.org/publicdomain/zero/1.0/legalcode

This means that you may copy, distribute, modify, and use my code without
any fear of lawsuits from me. It also means that my code is provided with NO
WARRANTIES of any kind, so that I may have no fear of lawsuits from you.

This waiver/license applies to all of the code in the project as well as this
particular file.

I always enjoy emails or messages about strange new places where my code is
being used, but I place no obligation on anyone to notify me of such things.
