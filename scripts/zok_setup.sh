################################################
## Compile and setup ZoKrates files
################################################

zokrates compile -i ./zok/onAddCredentialsBig.zok -o alb.out
zokrates compile -i alb.out -p alb.proving.key -v alb.verification.key

zokrates compile -i ./zok/onAddCredentialsSmall.zok -o als.out
zokrates compile -i als.out -p als.proving.key -v als.verification.key

zokrates compile -i ./zok/PoR.zok -o por.out
zokrates compile -i por.out -p por.proving.key -v por.verification.key
