import style from './style.module.scss';

import {useAppState, TextOverlayPosition} from '../../app-state';
import {CheckboxToggle, Dropdown, Slider, TextBox} from '../Widgets/Widgets';
import {SliderWithSpinBox} from '../SettingsList/SettingsList';

const positionOptions: {id: TextOverlayPosition, name: string}[] = [
    {id: 'center', name: 'Center'},
    {id: 'top', name: 'Top'},
    {id: 'bottom', name: 'Bottom'},
];

const TitleOverlayPane = () => {
    const {titleEnabled, titleText, titleDuration, titleFontSize, titlePosition} = useAppState();

    return (
        <div className={style.titlePane}>
            <div className={style.titleSettings}>
                <CheckboxToggle label="Enable title overlay" checked={titleEnabled} />
                <div className={style.setting}>
                    <TextBox value={titleText} placeholder="Enter title text..." disabled={!titleEnabled.value} />
                    <div className={style.settingLabel}>Duration</div>
                </div>
                <div className={style.setting}>
                    <SliderWithSpinBox
                        value={titleDuration}
                        min={0.5}
                        max={10}
                        step={0.5}
                    />
                    <div className={style.settingLabel}>Text</div>
                </div>
                <div className={style.setting}>
                    <SliderWithSpinBox
                        value={titleFontSize}
                        min={16}
                        max={120}
                        step={1}
                    />
                    <div className={style.settingLabel}>Font size</div>
                </div>
                <div className={style.setting}>
                    <Dropdown value={titlePosition} options={positionOptions} />
                    <div className={style.settingLabel}>Position</div>
                </div>
            </div>
        </div>
    );
};

export default TitleOverlayPane;
