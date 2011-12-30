# bsencode

bsencode is a binary-friendly encoder I developed for node.js, and I intend to
make it work with Python as well.

Basically my goal was to write a very simple binary *parser*, since it's 
usually easier to dump information than to read it back again. In doing so, I
accidentally found myself writing a bootstrapped encoding: a very low-level
syntax could be quickly parsed, but wasn't expressive enough, so I built a more
expressive language on top of it.

It is very much like [BSON](http://bsonspec.org/) and it is also very much like
[s-expressions](http://people.csail.mit.edu/rivest/Sexp.txt), but my goal was
to make [bencoding](http://wiki.theory.org/BitTorrentSpecification#Bencoding)
a little more legible.

# How does it compare?

Here is the same simple structure in several languages for comparison:

    JSON
      {"a": {"one": 1, "two": 2, "three": 3}, "b": ["one", "two", "three"]}
    bencode 
      d1:ad3:onei1e5:threei3e3:twoi2ee1:bdl3:one3:two5:threeeee
    BSON **
      U___#a_"___~three_#___~two_@___~one_!____$b_(___@0_$___one_@1_$___two_@2_^___three___
    bsencode
      (dict '1:a (dict '3:one 1 '5:three 3 '3:two 2) '1:b ('3:one '3:two '5:three))
    
    ** Most of the BSON bytes are not printable; this text file prints them by 
       using the following mapping:
    
        {0: '_', 1: '!', 2: '@', 3: '#', 4: '$', 6: '^', 16: '~'}

As far as code footprint goes, the BSON and JSON parsers that I could find took
around 300 lines to parse and 300 lines to serialize, usually without very 
specific error reporting. On the other hand, bencode is closer to 50 lines to
parse and 50 lines to serialize. While bsencode has the expressiveness of BSON
it takes only about 80 lines to serialize and 140 to parse, including full 
error reporting.
