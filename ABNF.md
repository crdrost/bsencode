# bsencode in Augmented Backus-Naur Form

## Defining BENCODE-STR

Before we begin, I will have to describe netstrings in RFC 4234's ABNF syntax.

The basic rule BENCODE-STR represents a bencode string: a sequence of ASCII
digits encoding a decimal number N, followed by a `:` character, followed by N 
arbitrary octets. In the RFC 4234 grammar this would have to be expressed as:

    BENCODE-STR = "0:" / "1:" 1OCTET / "2:" 2OCTET / "3:" 3OCTET / 
                    "4:" 4OCTET / "5:" 5OCTET / "6:" 6OCTET / <...>

This uses the angle-bracketed "prose description, to be used as last resort" 
mentioned in  RFC 4234 section 4 to indicate that the pattern continues 
*ad infinitum*. ABNF can normally handle infinite data structures via recursion
but the recursion which ABNF allows is a little too primitive to express the
digit-number equivalence used above. A slight modification of ABNF allowing 
rules to have parameters is discussed later, which allows netstrings to be 
described.

## The rest of the grammar

Given `BENCODE-STR`, we can define the rest of the core bsencode grammar with 
only the normal ABNF rules as:

      expr    = bstr / list / symbol

      ; Base Types
      bstr    = "'" BENCODE-STR     ; '23:An example byte string.

      list    = array / bin / date / dict / float / regex

      symbol  = true / false / null / int

      ; List Types
      array   = "(" [expr *(" " expr)] ")"

      bin     = "(" s-bin " " bstr ")"

      date    = "(" s-date " " int ")"

      dict    = "(" s-dict *(" (" bstr " " expr ")") ")"

      float   = "(" s-float " '8:" 8OCTET ")"

      regex   = "(" s-regex " " bstr " " reflags ")"

      ; Symbol Types
      true   = %x74.72.75.65        ; true

      false  = %x66.61.6c.73.65     ; false

      null   = %x6e.75.6c.6c        ; null

      int     = "0" / nz_int        ; Integer. Excludes -0.

      ; Auxiliary Definitions

      nz_int  = ["-"] dig1-9 *DIGIT ; Nonzero integer

      dig1-9  = %x31-39             ; 1-9

      ; regex flags admit optionally g, i, and m in that order
      reflags = ":" [%x67] [%x69] [%x6d]

      s-bin   = %x62.69.6e          ; bin

      s-date  = %x64.61.74.65       ; date

      s-dict  = %x64.69.63.74       ; dict

      s-float = %x66.6c.6f.61.74;   ; float

      s-regex = %x72.65.67.65.78    ; regex

## Alternate definition of BENCODE-STR with lambda-ABNF

I am not entirely satisfied with the above definition of `BENCODE-STR` so I 
offer a new one based on an extended version of ABNF which includes local 
rulenames. Since it reminds me of lambda calculus I am calling it lambda-ABNF.

The syntax is almost virtually identical to RFC 4234, but we add these two 
rules to the ABNF description of ABNF:

    rule /= rulename 1*(":" rulename) defined-as elements c-nl

    element /= rulename 1*(":" group) 

In other words, on the left hand side of a rule, a rule can now be specified
as a set of rule names separated by colons, and an element can now be specified
as a rulename followed by colons and groups. I force the use of groups here to 
avoid specifying associativity rules.

The interpretation of most elements is also virtually identical to RFC 4234. We
add that a rule with colons contains local rule names which must all be bound 
to groups when that rule appears as an element. That rule name then acts as a
local rule: it is defined as that bound group, but it is only defined within
the scope of the present rule.

In lambda-ABNF, the definition for `BENCODE-STR` would be described as:

    BS:num:str = num ":" str / BS:(num "0"):(10str) / 
            BS:(num "1"):(10str 1OCTET) / BS:(num "2"):(10str 2OCTET)
            BS:(num "3"):(10str 3OCTET) / BS:(num "4"):(10str 4OCTET)
            BS:(num "5"):(10str 5OCTET) / BS:(num "6"):(10str 6OCTET)
            BS:(num "7"):(10str 7OCTET) / BS:(num "8"):(10str 8OCTET)
            BS:(num "9"):(10str 9OCTET)

    BENCODE-STR = "0:" / 
            BS:("1"):(1OCTET) / BS:("2"):(2OCTET) / BS:("3"):(3OCTET) 
            BS:("4"):(4OCTET) / BS:("5"):(5OCTET) / BS:("6"):(6OCTET) 
            BS:("7"):(7OCTET) / BS:("8"):(8OCTET) / BS:("9"):(9OCTET) 

Here we are decomposing decimal numbers as `<n> <d>` representing
the number `10 * n + d`, and the tenfold repetition operator allows us to 
repeat the `OCTET` rule `10 * n` times followed by `d` times.
