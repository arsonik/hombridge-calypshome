export class CalypsHome {
    url = 'https://ma.calypshome.com';
    // private sessionId?: string = '18pm8fqb3f6111hnuca6wcjam9';
    private sessionId?: string;

    constructor(private auth: { username: string; password: string }) {
        console.log('CalypsHome', auth);
    }

    login() {
        return Promise.resolve(true).then(() =>
            fetch(`${this.url}/login`, {
                method: 'POST',
                redirect: 'manual',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({ _login: this.auth.username, _password: this.auth.password, _submit: 'Sign in' }).toString(),
            }).then((response) => {
                this.sessionId = response.headers.get('set-cookie')?.match(/JSESSIONID=([^;]+)/)?.[1];
                if (!response.headers.get('location')) {
                    throw new Error('Login failed');
                }
                console.log('Logged in', this.sessionId);
            })
        );
    }

    async devices(): Promise<
        {
            id: number;
            gw: string;
            name: string;
        }[]
    > {
        if (!this.sessionId) {
            await this.login();
        }
        return fetch(`${this.url}/ajax`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Cookie: `JSESSIONID=${this.sessionId}`,
            },
        })
            .then((x) => x.json())
            .then((data) => {



                const x = data[0][1]['objects'];
                return x.map((g: any) => {
                    const kv = g.statuss.reduce((acc, s: any) => {
                        acc[s.statusname.match(/\/([^/]+)$/)[1]] = s.status;
                        return acc;
                    }, {});
                    return ({
                        id: g.id,
                        gw: g.gw,
                        kv,
                        name: kv['__user_name'],
                        manufacturer: kv['manufacturer_name:'],
                        // all: JSON.stringify(g)
                    });
                });
            });
    }

    async action(object: { id: number; gw: string }, action: 'STOP' | 'CLOSE' | 'OPEN', value?: number) {
        if (!this.sessionId) {
            await this.login();
        }
        return fetch(`${this.url}/ihm`, {
            method: 'POST',
            headers: {
                Cookie: `JSESSIONID=${this.sessionId}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ gw: object.gw, id: object.id.toString(), action }).toString(),
        }).then((x) => x.json());
    }
}
