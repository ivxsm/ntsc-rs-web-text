/* eslint-disable @stylistic/max-len */
import style from './style.module.scss';

import Modal from '../Modal/Modal';
import {Button} from '../Widgets/Widgets';

const AboutModal = ({
    onClose,
    onShowCredits,
}: {
    onClose: () => void;
    onShowCredits: () => void;
}) => {
    return (
        <Modal
            onClose={onClose}
            className={style.aboutModal}
            title="ntsc-rs (web version)"
        >
            <p>
                Modified by <a href="https://github.com/ivxsm" target="_blank" rel="noopener noreferrer">Khaled</a>
            </p>
            <p style={{ paddingLeft: '1.5rem', fontStyle: 'italic' }}>
                Added the ability to overlay custom title text on your videos + date.
            </p>
            <p>
                Originally by <a href="https://github.com/valadaptive/" target="_blank" rel="noopener noreferrer">valadaptive</a>
            </p>
            <p>
                ...loosely based on <a href="https://github.com/JargeZ/ntscqt/" target="_blank" rel="noopener noreferrer">JargeZ/ntscqt</a>
            </p>
            <p>
                ...which is a GUI for <a href="https://github.com/zhuker/ntsc/" target="_blank" rel="noopener noreferrer">zhuker/ntsc</a>
            </p>
            <p>
                ...which is a port of <a href="https://github.com/joncampbell123/composite-video-simulator/" target="_blank" rel="noopener noreferrer">joncampbell123/composite-video-simulator</a>
            </p>
            <p>
                For the desktop version (with lossless output, interlaced video support, faster rendering, and more), visit <a
                    href="https://ntsc.rs"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    ntsc.rs
                </a>.
            </p>
            <p>
                <Button onClick={onShowCredits}>
                    View third-party licenses
                </Button>
            </p>
        </Modal>
    );
};

export default AboutModal;
