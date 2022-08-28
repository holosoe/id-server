# This script can send messages to the secure enclave.

# Forked from:
# https://github.com/aws/aws-nitro-enclaves-samples/blob/main/vsock_sample/py/vsock-sample.py

import argparse
import socket
import sys
import time

PORT = 5005
BUFF_SIZE = 1024

class VsockStream:
    """Client"""
    def __init__(self, conn_timeout=60):
        self.conn_timeout = conn_timeout
        self.latest_message = bytearray()
        self.received_proofs = False

    def connect(self, endpoint):
        """Connect to the remote endpoint"""
        self.sock = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
        self.sock.settimeout(self.conn_timeout)
        self.sock.connect(endpoint)

    def send_data(self, data):
        """Send data to a remote endpoint"""
        self.sock.sendall(data)

    def recv_data(self):
        """Receive data from a remote endpoint"""
        while True:
            data = self.sock.recv(BUFF_SIZE)
            if not data:
                break
            if 'start_message' in data.decode():
                self.latest_message = bytearray()
            elif 'end_message' in data.decode():
                print(self.latest_message.decode(), flush=True)
                self.received_proofs = True
                break
            else:
                self.latest_message.extend(data)

    def disconnect(self):
        """Close the client socket"""
        self.sock.close()


def gen_proofs_handler(args):
    client = VsockStream()
    endpoint = (1, PORT) # == (cid, port)
    client.connect(endpoint)
    encrypted_args = args['encrypted-args']
    client.send_data('start_message'.encode().ljust(BUFF_SIZE, b'\0'))
    client.send_data(encrypted_args.encode())
    client.send_data('end_message'.encode().ljust(BUFF_SIZE, b'\0'))

    client.recv_data()
    # wait for response from secure enclave
    required_close_time = time.time() + client.conn_timeout
    while not client.received_proofs and time.time() < required_close_time:
        time.sleep(1)

    client.disconnect()
    client.received_proofs = True

def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(title="options")

    gen_proofs_parser = subparsers.add_parser("generate-proofs", 
                                               description="Generate proofs",
                                               help="Generate addSmallLeaf proof and creds=='US' proof.")
    gen_proofs_parser.add_argument("encrypted-args", help="")
    gen_proofs_parser.set_defaults(func=gen_proofs_handler)

    if len(sys.argv) < 2:
        parser.print_usage()
        sys.exit(1)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()